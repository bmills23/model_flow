import { join } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { verifyManifest, type Manifest } from './checksums.js';
import { inorganicDermalWater } from './dermal-form.js';
import { sourceKeys } from './source-keys.js';
import type {
  ChemicalEntry,
  CleanupChemicalEntry,
  CleanupChemicalsFile,
  CleanupValueKey,
  ChemicalsFile,
  ChemicalValueKey,
  RiskChemicalEntry,
  RiskChemicalsFile,
  RiskValueKey,
  SpecialCase,
  TaggedValue,
  ToxEntry,
  ToxFile,
  ToxValue,
} from './types.js';

export interface RslBuild {
  chemicals: ChemicalsFile;
  /** The subset of `chemicals` the risk screen reads, derived here and never edited by hand. */
  risk: RiskChemicalsFile;
  /** The subset the cleanup screen reads (Koc, Kd, H', S, MW), derived here. */
  cleanup: CleanupChemicalsFile;
  tox: ToxFile;
}

type Cell = unknown;
type Row = Cell[];

/** First data row (zero based) in all three tables: key line, group header line, column header line. */
const FIRST_DATA_ROW = 3;

const loadRows = async (path: string): Promise<Row[]> => {
  const sheets = await readXlsxFile(path);
  const first = sheets[0];
  if (!first) throw new Error(`${path} has no sheets`);
  return (first.data as Row[]).slice(FIRST_DATA_ROW);
};

const text = (c: Cell): string | undefined => {
  if (c === null || c === undefined) return undefined;
  const s = String(c).trim();
  return s === '' ? undefined : s;
};

const num = (c: Cell, where: string): number | undefined => {
  if (c === null || c === undefined) return undefined;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  throw new Error(`${where}: expected a number, found ${JSON.stringify(c)}`);
};

interface Ident {
  cas: string | undefined;
  rslName: string;
}

const identOf = (row: Row, nameCol: number, casCol: number, where: string): Ident => {
  const rslName = text(row[nameCol]);
  if (!rslName) throw new Error(`${where}: row without an analyte name`);
  return { rslName, cas: text(row[casCol]) };
};

const rowKey = (i: Ident): string => `${i.cas ?? ''}|${i.rslName}`;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const displayName = (rslName: string): string => rslName.replace(/^~/, '').trim();

/** CAS number as id; a name slug is appended where one CAS number carries several rows, and a row
 * without a CAS number is identified by its name slug. Uniqueness is asserted. */
const assignIds = (idents: Ident[]): string[] => {
  const perCas = new Map<string, number>();
  for (const i of idents) if (i.cas) perCas.set(i.cas, (perCas.get(i.cas) ?? 0) + 1);
  const ids = idents.map((i) => {
    if (!i.cas) return slug(displayName(i.rslName));
    return (perCas.get(i.cas) ?? 0) > 1 ? `${i.cas}-${slug(displayName(i.rslName))}` : i.cas;
  });
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id))
      throw new Error(`RSL chemical id is not unique: ${JSON.stringify(id)}`);
    seen.add(id);
  }
  return ids;
};

const special: Record<string, SpecialCase> = {
  '79-01-6': 'trichloroethylene',
  '75-01-4': 'vinyl-chloride',
};

/* Column layouts (zero based), read from the November 2024 header rows. */
const SUMMARY = {
  sfo: 0,
  iur: 2,
  rfdo: 4,
  rfci: 6,
  vol: 8,
  mutagen: 9,
  giabs: 10,
  absd: 11,
  csat: 12,
  name: 13,
  cas: 14,
  mcl: 25,
  riskSsl: 26,
  riskSslKey: 27,
  mclSsl: 28,
} as const;

const PARAMS = {
  name: 0,
  cas: 1,
  mw: [2, 3],
  hPrime: [4, 6],
  hlc: [5, 6],
  vp: [7, 8],
  mp: [9, 10],
  density: [11, 12],
  dia: [13, 15],
  diw: [14, 15],
  kd: [16, 17],
  koc: [18, 19],
  logKow: [20, 21],
  s: [22, 23],
  b: [24, -1],
  tauEvent: [25, -1],
  tStar: [26, -1],
  kp: [27, 28],
} as const;

const TAPWATER = {
  name: 14,
  cas: 15,
  fa: 12,
  epd: 13,
  dermalCancer: 17,
  dermalNoncancer: 21,
} as const;

const toxValue = (row: Row, valueCol: number, where: string): ToxValue | undefined => {
  const value = num(row[valueCol], where);
  if (value === undefined) return undefined;
  const source = text(row[valueCol + 1]);
  if (!source) throw new Error(`${where}: value without a source key`);
  if (!(source in sourceKeys)) throw new Error(`${where}: unmapped source key ${source}`);
  return { value, source };
};

const buildTox = (rows: Row[], ids: string[]): ToxEntry[] =>
  rows.map((row, n) => {
    const ident = identOf(row, SUMMARY.name, SUMMARY.cas, 'summary table');
    const where = `summary table ${ident.rslName}`;
    const id = ids[n]!;
    const entry: ToxEntry = {
      id,
      ...(ident.cas ? { cas: ident.cas } : {}),
      name: displayName(ident.rslName),
      rslName: ident.rslName,
      volatile: false,
      mutagen: false,
    };
    for (const k of ['sfo', 'iur', 'rfdo', 'rfci'] as const) {
      const v = toxValue(row, SUMMARY[k], `${where} ${k}`);
      if (v) entry[k] = v;
    }
    const vol = text(row[SUMMARY.vol]);
    if (vol !== undefined && vol !== 'V')
      throw new Error(`${where}: unexpected volatile flag ${vol}`);
    entry.volatile = vol === 'V';
    const mut = text(row[SUMMARY.mutagen]);
    if (mut !== undefined && mut !== 'M')
      throw new Error(`${where}: unexpected mutagen flag ${mut}`);
    entry.mutagen = mut === 'M';
    const giabs = num(row[SUMMARY.giabs], `${where} GIABS`);
    if (giabs !== undefined) entry.giabs = giabs;
    const absd = num(row[SUMMARY.absd], `${where} ABSd`);
    if (absd !== undefined) entry.absd = absd;
    const csat = num(row[SUMMARY.csat], `${where} Csat`);
    if (csat !== undefined) entry.csat = csat;
    const mclCell = row[SUMMARY.mcl];
    if (typeof mclCell === 'number') {
      entry.mcl = mclCell;
    } else if (mclCell !== null && mclCell !== undefined) {
      const m = /^\s*(\S*?)\(G\)\s*$/.exec(String(mclCell));
      if (!m) throw new Error(`${where}: unexpected MCL cell ${JSON.stringify(mclCell)}`);
      entry.mclGroup = true;
      if (m[1]) {
        const v = Number(m[1]);
        if (!Number.isFinite(v)) throw new Error(`${where}: unreadable MCL ${m[1]}`);
        entry.mcl = v;
      }
    }
    const riskSsl = num(row[SUMMARY.riskSsl], `${where} risk-based SSL`);
    const mclSsl = num(row[SUMMARY.mclSsl], `${where} MCL-based SSL`);
    if (riskSsl !== undefined || mclSsl !== undefined) {
      const published: NonNullable<ToxEntry['publishedSsl']> = {};
      if (riskSsl !== undefined) {
        const key = text(row[SUMMARY.riskSslKey]);
        if (!key || !['c', 'c*', 'c**', 'n'].includes(key))
          throw new Error(`${where}: risk-based SSL without a valid key (${key})`);
        published.risk = { value: riskSsl, key };
      }
      if (mclSsl !== undefined) published.mcl = mclSsl;
      entry.publishedSsl = published;
    }
    const sp = ident.cas ? special[ident.cas] : undefined;
    if (sp) entry.special = sp;
    return entry;
  });

const buildChemicals = (paramRows: Row[], tapRows: Row[], ids: string[]): ChemicalEntry[] =>
  paramRows.map((row, n) => {
    const ident = identOf(row, PARAMS.name, PARAMS.cas, 'parameters table');
    const where = `parameters table ${ident.rslName}`;
    const tap = tapRows[n]!;
    const values: ChemicalEntry['values'] = {};
    const kpRef = text(row[PARAMS.kp[1]]);
    for (const key of Object.keys(PARAMS) as (keyof typeof PARAMS)[]) {
      if (key === 'name' || key === 'cas') continue;
      const [valueCol, refCol] = PARAMS[key] as readonly [number, number];
      const value = num(row[valueCol], `${where} ${key}`);
      if (value === undefined) continue;
      // B, tau_event and t* are RAGS E outputs with no reference column of their own; they carry
      // the Kp reference.
      const ref = refCol >= 0 ? text(row[refCol]) : kpRef;
      const tagged: TaggedValue = ref ? { value, ref } : { value };
      values[key as ChemicalValueKey] = tagged;
    }
    const entry: ChemicalEntry = {
      id: ids[n]!,
      ...(ident.cas ? { cas: ident.cas } : {}),
      name: displayName(ident.rslName),
      rslName: ident.rslName,
      values,
    };
    const fa = num(tap[TAPWATER.fa], `tap water table ${ident.rslName} FA`);
    if (fa !== undefined) entry.fa = fa;
    const epd = text(tap[TAPWATER.epd]);
    if (epd !== undefined) {
      if (epd !== 'Yes' && epd !== 'No') {
        throw new Error(`tap water table ${ident.rslName}: unexpected In EPD? value ${epd}`);
      }
      entry.inEpd = epd === 'Yes';
    }
    const published =
      num(tap[TAPWATER.dermalCancer], `tap water table ${ident.rslName} dermal cancer SL`) !==
        undefined ||
      num(tap[TAPWATER.dermalNoncancer], `tap water table ${ident.rslName} dermal noncancer SL`) !==
        undefined;
    if (entry.id in inorganicDermalWater) {
      if (!published)
        throw new Error(`${ident.rslName}: listed inorganic but no published dermal SL`);
      entry.dermalForm = 'inorganic';
    } else if (published) {
      entry.dermalForm = 'organic';
    }
    return entry;
  });

const checkedChemicals = (chemicals: ChemicalEntry[]): ChemicalEntry[] => {
  const known = new Set(chemicals.map((c) => c.id));
  for (const id of Object.keys(inorganicDermalWater)) {
    if (!known.has(id)) throw new Error(`inorganic dermal water list names an unknown id: ${id}`);
  }
  return chemicals;
};

const roleFile = (m: Manifest, role: 'summary' | 'parameters' | 'tapwater') => {
  const f = m.files.find((x) => x.role === role);
  if (!f) throw new Error(`manifest has no ${role} file`);
  return f;
};

const RISK_KEYS: readonly RiskValueKey[] = ['kp', 'tauEvent', 'tStar', 'b'];

/** The risk screen's subset of the chemical file: dermal water inputs only, chemicals with none are left out. */
export const deriveRiskChemicals = (file: ChemicalsFile): RiskChemicalsFile => {
  const chemicals: RiskChemicalEntry[] = [];
  for (const c of file.chemicals) {
    const entry: RiskChemicalEntry = { id: c.id, values: {} };
    for (const k of RISK_KEYS) {
      const v = c.values[k];
      if (v) entry.values[k] = { value: v.value };
    }
    if (c.fa !== undefined) entry.fa = c.fa;
    if (c.inEpd !== undefined) entry.inEpd = c.inEpd;
    if (c.dermalForm !== undefined) entry.dermalForm = c.dermalForm;
    if (Object.keys(entry.values).length > 0 || Object.keys(entry).length > 2)
      chemicals.push(entry);
  }
  return {
    edition: file.edition,
    source: file.source,
    units: {
      kp: file.units.kp,
      tauEvent: file.units.tauEvent,
      tStar: file.units.tStar,
      b: file.units.b,
    },
    chemicals,
  };
};

const CLEANUP_KEYS: readonly CleanupValueKey[] = ['koc', 'kd', 'hPrime', 's', 'mw'];

/** The cleanup screen's subset of the chemical file: chemicals with none of the five values are left out. */
export const deriveCleanupChemicals = (file: ChemicalsFile): CleanupChemicalsFile => {
  const chemicals: CleanupChemicalEntry[] = [];
  for (const c of file.chemicals) {
    const entry: CleanupChemicalEntry = { id: c.id, values: {} };
    for (const k of CLEANUP_KEYS) {
      const v = c.values[k];
      if (!v) continue;
      entry.values[k] = k === 'kd' && v.ref ? { value: v.value, ref: v.ref } : { value: v.value };
    }
    if (Object.keys(entry.values).length > 0) chemicals.push(entry);
  }
  return {
    edition: file.edition,
    source: file.source,
    units: Object.fromEntries(
      CLEANUP_KEYS.map((k) => [k, file.units[k]]),
    ) as CleanupChemicalsFile['units'],
    chemicals,
  };
};

/** Verifies the committed raw files against the manifest, then builds both database files. */
export const buildRsl = async (rawDir: string): Promise<RslBuild> => {
  const manifest = verifyManifest(rawDir);
  const summary = roleFile(manifest, 'summary');
  const params = roleFile(manifest, 'parameters');
  const tap = roleFile(manifest, 'tapwater');
  const [summaryRows, paramRows, tapRows] = await Promise.all([
    loadRows(join(rawDir, summary.file)),
    loadRows(join(rawDir, params.file)),
    loadRows(join(rawDir, tap.file)),
  ]);

  // The three tables list the same analytes in the same order; assert it rather than assume it.
  if (summaryRows.length !== paramRows.length || summaryRows.length !== tapRows.length) {
    throw new Error('RSL tables differ in row count');
  }
  const summaryIdents = summaryRows.map((r) => identOf(r, SUMMARY.name, SUMMARY.cas, 'summary'));
  const paramIdents = paramRows.map((r) => identOf(r, PARAMS.name, PARAMS.cas, 'parameters'));
  const tapIdents = tapRows.map((r) => identOf(r, TAPWATER.name, TAPWATER.cas, 'tap water'));
  summaryIdents.forEach((s, n) => {
    if (rowKey(s) !== rowKey(paramIdents[n]!) || rowKey(s) !== rowKey(tapIdents[n]!)) {
      throw new Error(`RSL tables disagree at row ${n + FIRST_DATA_ROW + 1}: ${rowKey(s)}`);
    }
  });
  const ids = assignIds(summaryIdents);

  const source = (documents: number[]) => ({
    reference: manifest.reference,
    documents,
    retrieved: manifest.retrieved,
  });
  const chemicals: ChemicalsFile = {
    edition: manifest.edition,
    source: source([params.semsId, tap.semsId]),
    units: {
      mw: 'g/mol',
      hPrime: '1',
      hlc: 'atm-m3/mol',
      vp: 'mmHg',
      mp: 'C',
      density: 'g/cm3',
      dia: 'cm2/s',
      diw: 'cm2/s',
      kd: 'L/kg',
      koc: 'L/kg',
      logKow: '1',
      s: 'mg/L',
      b: '1',
      tauEvent: 'h',
      tStar: 'h',
      kp: 'cm/h',
    },
    chemicals: checkedChemicals(buildChemicals(paramRows, tapRows, ids)),
  };
  return {
    chemicals,
    risk: deriveRiskChemicals(chemicals),
    cleanup: deriveCleanupChemicals(chemicals),
    tox: {
      edition: manifest.edition,
      source: source([summary.semsId]),
      units: {
        sfo: '(mg/kg-d)-1',
        iur: '(ug/m3)-1',
        rfdo: 'mg/kg-d',
        rfci: 'mg/m3',
        csat: 'mg/kg',
        mcl: 'ug/L',
        publishedSsl: 'mg/kg',
      },
      sourceKeys: { ...sourceKeys },
      toxicity: buildTox(summaryRows, ids),
    },
  };
};

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
