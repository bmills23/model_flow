import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyManifest, type NrwqcManifestFile } from './manifest.js';
import { pageDate, parseCas, parseCell, parseConversionFactor, readTables } from './parse.js';
import type {
  AquaticFile,
  AquaticRow,
  ConversionFactorRow,
  CriterionCell,
  CriterionKind,
  Edition,
  HardnessEquation,
  HardnessFile,
  HardnessMetal,
  HumanHealthFile,
  HumanHealthRow,
  WaterType,
} from './types.js';

export interface NrwqcBuild {
  aquatic: AquaticFile;
  humanHealth: HumanHealthFile;
  hardness: HardnessFile;
}

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

const LICENCE =
  'U.S. government work, public domain in the United States; the page states no restriction.';

/** Rows that are water properties or narrative entries, not chemicals. */
const PARAMETER =
  /^(aesthetic qualities|alkalinity|color|gases, total dissolved|hardness|nutrients|oil and grease|oxygen, dissolved|ph$|solids|tainting substances|temperature|pathogen)/i;

/** A note that makes the aquatic criterion depend on site water chemistry. */
/** Values printed for one pH although the criterion is a function of pH (pentachlorophenol). */
const PH_DEPENDENT = /expressed as a function of pH/i;
const SITE_SPECIFIC = /water chemistry|biotic ligand|\bph, temperature|criterion for selenium/i;

const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const readPage = (dir: string, f: NrwqcManifestFile): string => {
  const html = readFileSync(join(dir, f.file), 'utf8');
  if (pageDate(html) !== f.pageDate) {
    throw new Error(
      `${f.file}: page date ${pageDate(html)} differs from the manifest ${f.pageDate}`,
    );
  }
  return html;
};

const edition = (editionName: string, retrieved: string, f: NrwqcManifestFile): Edition => ({
  edition: editionName,
  source: {
    reference: f.reference,
    url: f.url,
    pageDate: f.pageDate,
    retrieved,
    licence: LICENCE,
  },
});

interface Ident {
  id: string;
  name: string;
  kind: CriterionKind;
  priority: boolean;
  cas: string[];
}

const identify = (rawName: string, rawCas: string): Ident => {
  const priority = /\(P\)/.test(rawName);
  let name = rawName
    .replace(/\(P\)/g, '')
    .replace(/\s*\*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  name = name.replace(/([a-z])(Oxygen)/, '$1 / $2');
  if (name === '') throw new Error('a table row has no name');
  const cas = parseCas(rawCas);
  const kind: CriterionKind = PARAMETER.test(name)
    ? 'parameter'
    : cas.length > 0
      ? 'chemical'
      : 'group';
  return { id: cas[0] ?? slug(name), name, kind, priority, cas };
};

const assertUnique = (rows: { id: string }[], where: string): void => {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`${where}: duplicate row id ${r.id}`);
    seen.add(r.id);
  }
};

const unitFix = (name: string, cell: CriterionCell): CriterionCell =>
  name === 'pH' && cell.status === 'value' ? { ...cell, unit: 'standard units' } : cell;

const buildHardness = (html: string, aquatic: AquaticRow[], ed: Edition): HardnessFile => {
  const tables = readTables(html);
  const tableA = tables.find((t) => /Appendix A/.test(t.attrs));
  const tableB = tables.find((t) => /Appendix B/.test(t.attrs));
  if (!tableA || !tableB) throw new Error('the aquatic life page lacks Appendix A or Appendix B');

  const conversionFactors: ConversionFactorRow[] = [];
  for (const cells of tableA.rows) {
    if (cells.length !== 5) throw new Error(`Appendix A row has ${cells.length} cells`);
    if (cells[0] === 'Metal') continue;
    const [name, fc, fcc, sc, scc] = cells as [string, string, string, string, string];
    conversionFactors.push({
      name,
      freshwater: { cmc: parseConversionFactor(fc), ccc: parseConversionFactor(fcc) },
      saltwater: { cmc: parseConversionFactor(sc), ccc: parseConversionFactor(scc) },
    });
  }
  if (conversionFactors.length === 0) throw new Error('Appendix A has no rows');

  const metals: HardnessMetal[] = [];
  for (const cells of tableB.rows) {
    if (cells.length !== 7) continue; // header rows
    const name = cells[0]!.replace(/\d+$/, '').trim();
    const [, mA, bA, mC, bC, cfA, cfC] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const letterKey = letters(name);
    const row = aquatic.find((r) => r.kind === 'chemical' && letters(r.name) === letterKey);
    if (!row) throw new Error(`Appendix B metal ${name} has no row in the aquatic life table`);
    const factors = conversionFactors.find((c) => letters(c.name) === letterKey);
    if (!factors) throw new Error(`Appendix B metal ${name} has no Appendix A conversion factors`);
    if (!factors.freshwater.cmc) throw new Error(`${name} has no freshwater CMC conversion factor`);

    // Appendix B repeats the freshwater factors of Appendix A; they must agree where printed.
    for (const [printed, appendixA, which] of [
      [cfA, factors.freshwater.cmc, 'CMC'],
      [cfC, factors.freshwater.ccc, 'CCC'],
    ] as const) {
      const b = parseConversionFactor(printed);
      if (b && JSON.stringify(b) !== JSON.stringify(appendixA)) {
        throw new Error(
          `${name}: Appendix A and B disagree on the freshwater ${which} conversion factor`,
        );
      }
    }

    const acute: HardnessEquation = {
      slope: Number(mA),
      intercept: Number(bA),
      conversionFactor: factors.freshwater.cmc,
    };
    const freshwater: HardnessMetal['freshwater'] = { acute };
    if (/^-?\d/.test(mC) && /^-?\d/.test(bC)) {
      if (!factors.freshwater.ccc)
        throw new Error(`${name} has a chronic equation but no conversion factor`);
      freshwater.chronic = {
        slope: Number(mC),
        intercept: Number(bC),
        conversionFactor: factors.freshwater.ccc,
      };
    }
    for (const v of [
      acute.slope,
      acute.intercept,
      freshwater.chronic?.slope ?? 0,
      freshwater.chronic?.intercept ?? 0,
    ]) {
      if (!Number.isFinite(v)) throw new Error(`${name}: Appendix B has a non-numeric parameter`);
    }
    metals.push({ id: row.id, name, freshwater });
  }
  if (metals.length === 0) throw new Error('Appendix B has no rows');
  return {
    ...ed,
    units: { criterion: 'ug/L', hardness: 'mg/L as CaCO3' },
    metals,
    conversionFactors,
  };
};

/** Reads the committed pages; verifies the checksum manifest first and never touches the network. */
export const buildNrwqc = (rawDir: string): NrwqcBuild => {
  const manifest = verifyManifest(rawDir);
  const file = (role: NrwqcManifestFile['role']): NrwqcManifestFile => {
    const f = manifest.files.find((x) => x.role === role);
    if (!f) throw new Error(`the manifest lists no ${role} page`);
    return f;
  };

  // Aquatic life table.
  const aqFile = file('aquatic');
  const aqHtml = readPage(rawDir, aqFile);
  const aqTable = readTables(aqHtml).find((t) => /id="datatable"/.test(t.attrs));
  if (!aqTable) throw new Error('the aquatic life page has no data table');
  const aqRows: AquaticRow[] = [];
  for (const cells of aqTable.rows.slice(1)) {
    if (cells.length !== 8)
      throw new Error(`aquatic life row has ${cells.length} cells: ${cells[0]}`);
    const [rawName, rawCas, fCmc, fCcc, sCmc, sCcc, year, notes] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const id = identify(rawName, rawCas);
    const cell = (c: string) => unitFix(id.name, parseCell(c));
    const freshwater = { cmc: cell(fCmc), ccc: cell(fCcc) };
    const saltwater = { cmc: cell(sCmc), ccc: cell(sCcc) };
    const siteSpecific = SITE_SPECIFIC.test(notes);
    const missing = (w: { cmc: CriterionCell; ccc: CriterionCell }) =>
      w.cmc.status !== 'value' && w.ccc.status !== 'value';
    const siteSpecificFor: WaterType[] = [];
    if (siteSpecific && missing(freshwater)) siteSpecificFor.push('fresh');
    // the calculators the notes name are for saltwater only where the notes say so (aluminum has no
    // saltwater criterion at all, which is "no criterion", not "site-specific")
    if (siteSpecific && missing(saltwater) && /salt/i.test(notes)) siteSpecificFor.push('salt');
    const phDependent = PH_DEPENDENT.test(notes);
    const phDependentFor: WaterType[] = [];
    let printedAtPh: number | undefined;
    if (phDependent) {
      const m = /corresponds? to a pH of (\d+(?:\.\d+)?)/i.exec(notes);
      if (!m) throw new Error(`the pH the values are printed at is not stated: ${id.name}`);
      printedAtPh = Number(m[1]);
      const fresh = /freshwater/i.test(notes);
      const salt = /saltwater/i.test(notes);
      if (fresh || !salt) phDependentFor.push('fresh');
      if (salt || !fresh) phDependentFor.push('salt');
    }
    aqRows.push({
      ...id,
      freshwater,
      saltwater,
      publicationYear: year,
      siteSpecific,
      siteSpecificFor,
      phDependentFor,
      ...(printedAtPh !== undefined ? { printedAtPh } : {}),
      hardnessDependent: false,
      notes,
    });
  }
  assertUnique(aqRows, 'aquatic life table');
  if (aqRows.length < 60) throw new Error(`aquatic life table has only ${aqRows.length} rows`);

  const aqEdition = edition(manifest.edition, manifest.retrieved, aqFile);
  const hardness = buildHardness(aqHtml, aqRows, aqEdition);
  const dependent = new Set(hardness.metals.map((m) => m.id));
  for (const r of aqRows) r.hardnessDependent = dependent.has(r.id);

  // Human health table.
  const hhFile = file('human-health');
  const hhHtml = readPage(rawDir, hhFile);
  const hhTable = readTables(hhHtml).find((t) => /id="datatable"/.test(t.attrs));
  if (!hhTable) throw new Error('the human health page has no data table');
  const hhRows: HumanHealthRow[] = [];
  for (const cells of hhTable.rows.slice(1)) {
    if (cells.length !== 6)
      throw new Error(`human health row has ${cells.length} cells: ${cells[0]}`);
    const [rawName, rawCas, wo, o, year, notes] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const id = identify(rawName, rawCas);
    hhRows.push({
      ...id,
      waterAndOrganism: unitFix(id.name, parseCell(wo)),
      organismOnly: unitFix(id.name, parseCell(o)),
      publicationYear: year,
      notes,
    });
  }
  assertUnique(hhRows, 'human health table');
  if (hhRows.length < 100) throw new Error(`human health table has only ${hhRows.length} rows`);

  return {
    aquatic: { ...aqEdition, units: { criterion: 'ug/L' }, rows: aqRows },
    humanHealth: {
      ...edition(manifest.edition, manifest.retrieved, hhFile),
      units: { criterion: 'ug/L' },
      rows: hhRows,
    },
    hardness,
  };
};
