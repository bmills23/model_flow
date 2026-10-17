import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChemicalsFile } from '../rsl/types.js';
import { biodegradationClasses, petroleumChemicals } from './classes.js';
import { oxygenDemand } from './formulas.js';
import type { LookupRow, VaporChemicalEntry, VaporChemicalsFile, VaporRslKey } from './types.js';

const RSL_KEYS: readonly VaporRslKey[] = ['mw', 'hPrime', 'hlc', 'vp', 'dia', 'diw', 'koc', 's'];

interface VaporManifest {
  reference: string;
  url: string;
  retrieved: string;
  pdf: { file: string; bytes: number; sha256: string };
  table: { file: string };
}

export const readVaporManifest = (dir: string): VaporManifest =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as VaporManifest;

/** Throws if the committed PDF is missing or its SHA-256 differs from the manifest. */
export const verifyVaporManifest = (dir: string): VaporManifest => {
  const manifest = readVaporManifest(dir);
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(dir, manifest.pdf.file));
  } catch {
    throw new Error(`EPA 2004 raw file ${manifest.pdf.file} is missing from ${dir}`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== manifest.pdf.sha256) {
    throw new Error(
      `${manifest.pdf.file} checksum mismatch: manifest ${manifest.pdf.sha256}, file ${actual}`,
    );
  }
  return manifest;
};

/** Splits one CSV line, honouring double-quoted fields (names contain commas). */
const splitCsv = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

const finite = (s: string, where: string): number => {
  const n = Number(s);
  if (s.trim() === '' || !Number.isFinite(n))
    throw new Error(`${where}: expected a number, found "${s}"`);
  return n;
};

/** Reads the committed transcription of the EPA 2004 chemical properties lookup table. */
export const readLookupTable = (dir: string): LookupRow[] => {
  const manifest = readVaporManifest(dir);
  const lines = readFileSync(join(dir, manifest.table.file), 'utf8')
    .split('\n')
    .filter((l) => l !== '');
  const header = splitCsv(lines[0]!);
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`lookup table has no column ${name}`);
    return i;
  };
  const idx = {
    cas: col('cas'),
    name: col('name'),
    tb: col('tbK'),
    tc: col('tcK'),
    dh: col('dhvbCalPerMol'),
    at: col('dhvbAtNormalBoilingPoint'),
    note: col('note'),
    page: col('pdfPage'),
  };
  return lines.slice(1).map((line, n) => {
    const f = splitCsv(line);
    const where = `lookup table row ${n + 2}`;
    const at = f[idx.at];
    if (at !== 'true' && at !== 'false') throw new Error(`${where}: bad enthalpy flag "${at}"`);
    return {
      cas: f[idx.cas]!,
      name: f[idx.name]!,
      tbK: finite(f[idx.tb]!, where),
      tcK: finite(f[idx.tc]!, where),
      dhvbCalPerMol: finite(f[idx.dh]!, where),
      dhvbAtNormalBoilingPoint: at === 'true',
      note: f[idx.note] ?? '',
      pdfPage: finite(f[idx.page]!, where),
    };
  });
};

/**
 * Physical plausibility bands for a published lookup row. A published value outside them is a misprint
 * or a unit slip (sec-butylbenzene's enthalpy, tert-butylbenzene's critical temperature) and must not
 * reach the engine, where the Watson correction would amplify it. No replacement value is substituted.
 */
export const TROUTON_BAND_CAL_PER_MOL_K = { min: 10, max: 40 } as const;
export const TC_OVER_TB_BAND = { min: 1.2, max: 2.2 } as const;
/** Elemental mercury is a liquid metal whose T_C/T_B (about 2.8) is genuine, so the ratio band skips it. */
const TC_RATIO_EXEMPT = new Set(['7439-97-6']);

export interface LookupScreen {
  /** Reason the enthalpy is implausible, when it is. */
  dhvb?: string;
  /** Reason the critical temperature is implausible, when it is. */
  tc?: string;
}

export const screenLookupRow = (r: LookupRow): LookupScreen => {
  const out: LookupScreen = {};
  if (!(r.tbK < r.tcK)) out.tc = `T_B ${r.tbK} K is not below T_C ${r.tcK} K`;
  else if (!TC_RATIO_EXEMPT.has(r.cas)) {
    const ratio = r.tcK / r.tbK;
    if (ratio < TC_OVER_TB_BAND.min || ratio > TC_OVER_TB_BAND.max)
      out.tc = `T_C/T_B ${ratio.toFixed(2)} outside ${TC_OVER_TB_BAND.min} to ${TC_OVER_TB_BAND.max}`;
  }
  if (r.dhvbAtNormalBoilingPoint) {
    const trouton = r.dhvbCalPerMol / r.tbK;
    if (trouton < TROUTON_BAND_CAL_PER_MOL_K.min || trouton > TROUTON_BAND_CAL_PER_MOL_K.max)
      out.dhvb = `Trouton ratio ${trouton.toFixed(1)} cal/(mol K) outside ${TROUTON_BAND_CAL_PER_MOL_K.min} to ${TROUTON_BAND_CAL_PER_MOL_K.max}`;
  }
  return out;
};

/**
 * Builds the vapor screen's chemical subset: RSL rows that have EPA 2004 temperature-correction data,
 * a published biodegradation class, or both. RSL values are copied unchanged; new data never overrides one.
 */
export const buildVapor = (rawDir: string, rsl: ChemicalsFile): VaporChemicalsFile => {
  const manifest = verifyVaporManifest(rawDir);
  const lookup = new Map(readLookupTable(rawDir).map((r) => [r.cas, r]));
  const byId = new Map(rsl.chemicals.map((c) => [c.id, c]));

  for (const cas of Object.keys(petroleumChemicals)) {
    if (!byId.has(cas)) throw new Error(`petroleum chemical ${cas} is not in the RSL table`);
  }

  const chemicals: VaporChemicalEntry[] = [];
  const screenedEpa2004je: { id: string; field: 'dhvb' | 'tc'; reason: string }[] = [];
  for (const c of rsl.chemicals) {
    const row = lookup.get(c.id);
    const petro = petroleumChemicals[c.id];
    if (!row && !petro) continue;
    const entry: VaporChemicalEntry = { id: c.id, name: c.name, rsl: {} };
    for (const k of RSL_KEYS) {
      const v = c.values[k];
      if (v) entry.rsl[k] = v;
    }
    if (row) {
      const screen = screenLookupRow(row);
      if (screen.tc) {
        // A bad T_C poisons the Watson exponent and the correction itself: drop the whole block.
        screenedEpa2004je.push({ id: c.id, field: 'tc', reason: screen.tc });
        if (screen.dhvb) screenedEpa2004je.push({ id: c.id, field: 'dhvb', reason: screen.dhvb });
      } else {
        entry.epa2004je = { tbK: row.tbK, tcK: row.tcK, ref: 'epa2004je' };
        if (screen.dhvb) screenedEpa2004je.push({ id: c.id, field: 'dhvb', reason: screen.dhvb });
        else if (row.dhvbAtNormalBoilingPoint) entry.epa2004je.dhvbCalPerMol = row.dhvbCalPerMol;
      }
    }
    if (petro) {
      entry.biodegradation = {
        class: petro.class,
        kwPerHour: biodegradationClasses[petro.class].kwPerHour,
        ref: 'api2012biovapor',
      };
      entry.oxygen = { formula: petro.formula, ...oxygenDemand(petro.formula) };
    }
    chemicals.push(entry);
  }

  return {
    source: {
      rsl: {
        reference: rsl.source.reference,
        edition: rsl.edition,
        documents: rsl.source.documents,
        retrieved: rsl.source.retrieved,
      },
      epa2004je: {
        reference: manifest.reference,
        file: manifest.pdf.file,
        sha256: manifest.pdf.sha256,
        retrieved: manifest.retrieved,
      },
      api2012biovapor: { reference: 'api2012biovapor', appendix: 'C' },
    },
    units: {
      tbK: 'K',
      tcK: 'K',
      dhvbCalPerMol: 'cal/mol',
      kwPerHour: '1/h',
      molecularWeight: 'g/mol',
      molO2PerMol: 'mol/mol',
      massRatio: 'g/g',
    },
    chemicals,
    screenedEpa2004je,
    unmatchedEpa2004je: [...lookup.keys()].filter((cas) => !byId.has(cas)),
  };
};
