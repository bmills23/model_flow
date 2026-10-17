import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { ChemicalsFile } from '../src/rsl/types.js';
import type { VaporRslKey } from '../src/vapor/types.js';
import { serialize } from '../src/rsl/build.js';
import { buildVapor, readLookupTable, screenLookupRow, verifyVaporManifest } from '../src/vapor/build.js';
import { biodegradationClasses, petroleumChemicals } from '../src/vapor/classes.js';
import { oxygenDemand } from '../src/vapor/formulas.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw/vapor/epa2004je');
const rslFile = resolve(here, '../generated/rsl-2024-11/chemicals.json');
const generatedFile = resolve(here, '../generated/vapor/vapor-chemicals.json');

const rsl = JSON.parse(readFileSync(rslFile, 'utf8')) as ChemicalsFile;
const built = buildVapor(rawDir, rsl);
const entry = (id: string) => built.chemicals.find((c) => c.id === id);

describe('EPA 2004 lookup table transcription', () => {
  const rows = readLookupTable(rawDir);
  const row = (cas: string) => rows.find((r) => r.cas === cas);

  it('has the 108 chemicals of the Appendix C table, once each', () => {
    expect(rows).toHaveLength(108);
    expect(new Set(rows.map((r) => r.cas)).size).toBe(108);
  });

  // Values printed on the Appendix C worksheets (chemical properties sheet) of the same document.
  it('matches the benzene row (353.24 K, 562.16 K, 7,342 cal/mol)', () => {
    expect(row('71-43-2')).toMatchObject({ tbK: 353.24, tcK: 562.16, dhvbCalPerMol: 7342 });
  });
  it('matches the trichloroethylene row (360.36 K, 544.20 K, 7,505 cal/mol)', () => {
    expect(row('79-01-6')).toMatchObject({ tbK: 360.36, tcK: 544.2, dhvbCalPerMol: 7505 });
  });
  it('matches the tetrachloroethylene row (394.40 K, 620.20 K, 8,288 cal/mol)', () => {
    expect(row('127-18-4')).toMatchObject({ tbK: 394.4, tcK: 620.2, dhvbCalPerMol: 8288 });
  });

  it('has valid CAS check digits and T_B below T_C on every row', () => {
    for (const r of rows) {
      const digits = r.cas.replace(/-/g, '');
      const sum = [...digits.slice(0, -1)]
        .reverse()
        .reduce((s, d, i) => s + Number(d) * (i + 1), 0);
      expect(sum % 10, r.cas).toBe(Number(digits.slice(-1)));
      expect(r.tbK, r.cas).toBeLessThan(r.tcK);
    }
  });

  it('flags enthalpies that are not at the normal boiling point', () => {
    for (const cas of ['75-69-4', '76-13-1', '132-64-9', '123-73-9']) {
      expect(row(cas)?.dhvbAtNormalBoilingPoint, cas).toBe(false);
    }
    expect(row('71-43-2')?.dhvbAtNormalBoilingPoint).toBe(true);
  });
});

describe('raw file checksum', () => {
  const copies: string[] = [];
  afterAll(() => copies.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('accepts the committed PDF', () => {
    expect(() => verifyVaporManifest(rawDir)).not.toThrow();
  });

  it('fails on a checksum mismatch, for verify and for the build', () => {
    const d = mkdtempSync(join(tmpdir(), 'vapor-'));
    copies.push(d);
    cpSync(rawDir, d, { recursive: true });
    const file = join(d, 'epa-2004-je-users-guide.pdf');
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    writeFileSync(file, bytes);
    expect(() => verifyVaporManifest(d)).toThrow(/checksum/i);
    expect(() => buildVapor(d, rsl)).toThrow(/checksum/i);
  });
});

describe('merged vapor chemicals', () => {
  it('carries the RSL values byte-identical to chemicals.json for every row', () => {
    expect(built.chemicals.length).toBeGreaterThan(80);
    for (const c of built.chemicals) {
      const source = rsl.chemicals.find((r) => r.id === c.id);
      expect(source, c.id).toBeDefined();
      for (const [key, tagged] of Object.entries(c.rsl)) {
        expect(JSON.stringify(tagged), `${c.id} ${key}`).toBe(
          JSON.stringify(source!.values[key as VaporRslKey]),
        );
      }
    }
  });

  it('merges the EPA 2004 values for benzene by CAS number, tagged epa2004je', () => {
    expect(entry('71-43-2')?.epa2004je).toEqual({
      tbK: 353.24,
      tcK: 562.16,
      dhvbCalPerMol: 7342,
      ref: 'epa2004je',
    });
    expect(entry('71-43-2')?.rsl.hPrime?.value).toBeCloseTo(0.2269, 4);
  });

  it('leaves out an enthalpy that is not at the normal boiling point but keeps T_B and T_C', () => {
    const e = entry('76-13-1');
    expect(e?.epa2004je?.tbK).toBeGreaterThan(0);
    expect(e?.epa2004je?.dhvbCalPerMol).toBeUndefined();
    expect(entry('123-73-9')?.epa2004je?.dhvbCalPerMol).toBeUndefined();
  });

  it('reports lookup chemicals the RSL does not carry rather than dropping them silently', () => {
    expect(built.unmatchedEpa2004je.length).toBe(
      108 -
        built.chemicals.filter((c) => c.epa2004je).length -
        built.screenedEpa2004je.filter((x) => x.field === 'tc').length,
    );
    for (const cas of built.unmatchedEpa2004je) {
      expect(rsl.chemicals.some((r) => r.id === cas)).toBe(false);
    }
  });

  it('records provenance like the RSL build', () => {
    expect(built.source.epa2004je).toMatchObject({
      reference: 'epa2004je',
      sha256: 'c7c3a6f215e0214946c19d549a4fa8659e08d91a6dddd48d689204c7f1963ed0',
    });
    expect(built.source.rsl.reference).toBe(rsl.source.reference);
    expect(built.units.dhvbCalPerMol).toBe('cal/mol');
  });

  it('matches the committed generated file', () => {
    expect(serialize(built)).toBe(readFileSync(generatedFile, 'utf8'));
  });
});

describe('biodegradation classes (api2012biovapor Appendix C)', () => {
  it('has the six published class rates in 1/h', () => {
    const rates = Object.fromEntries(
      Object.entries(biodegradationClasses).map(([k, v]) => [k, v.kwPerHour]),
    );
    expect(rates).toEqual({
      alkylbenzene: 0.73,
      naphthalene: 19,
      'branched-cycloaliphatic': 11,
      'normal-alkane': 170,
      'mixed-aliphatic': 71,
      methane: 82,
    });
  });

  it('covers benzene, toluene, ethylbenzene, the xylenes and naphthalene', () => {
    const cls = (id: string) => entry(id)?.biodegradation?.class;
    for (const id of [
      '71-43-2',
      '108-88-3',
      '100-41-4',
      '95-47-6',
      '108-38-3',
      '106-42-3',
      '1330-20-7',
    ]) {
      expect(cls(id), id).toBe('alkylbenzene');
    }
    expect(cls('91-20-3')).toBe('naphthalene');
    expect(entry('91-20-3')?.biodegradation).toMatchObject({
      kwPerHour: 19,
      ref: 'api2012biovapor',
    });
  });

  it('gives a chemical with no class no rate, never a default', () => {
    expect(entry('79-01-6')?.biodegradation).toBeUndefined();
    expect(entry('108-90-7')?.biodegradation).toBeUndefined();
  });

  it('lists only chemicals the RSL carries, with a formula for each', () => {
    for (const [cas, p] of Object.entries(petroleumChemicals)) {
      expect(
        rsl.chemicals.some((r) => r.id === cas),
        cas,
      ).toBe(true);
      expect(p.formula.c, cas).toBeGreaterThan(0);
      expect(biodegradationClasses[p.class], cas).toBeDefined();
    }
  });
});

describe('oxygen demand from the molecular formula', () => {
  it('needs c + h/4 - o/2 mol O2 per mol (complete oxidation)', () => {
    expect(oxygenDemand({ c: 6, h: 6 }).molO2PerMol).toBeCloseTo(7.5, 12);
    expect(oxygenDemand({ c: 2, h: 6, o: 1 }).molO2PerMol).toBeCloseTo(3, 12);
  });

  it('gives benzene 7.5 O2 per C6H6 by mass, 3.07 g/g', () => {
    const d = oxygenDemand({ c: 6, h: 6 });
    expect(d.molecularWeight).toBeCloseTo(6 * 12.011 + 6 * 1.008, 10);
    expect(d.massRatio).toBeCloseTo((7.5 * 2 * 15.999) / (6 * 12.011 + 6 * 1.008), 12);
    expect(d.massRatio).toBeCloseTo(3.07, 2);
  });

  it('is in the merged file for the petroleum list and absent elsewhere', () => {
    expect(entry('71-43-2')?.oxygen?.molO2PerMol).toBeCloseTo(7.5, 12);
    expect(entry('91-20-3')?.oxygen?.molO2PerMol).toBeCloseTo(12, 12);
    expect(entry('79-01-6')?.oxygen).toBeUndefined();
  });

  it('rejects a formula that is not a positive carbon count', () => {
    expect(() => oxygenDemand({ c: 0, h: 4 })).toThrow(RangeError);
  });
});

describe('plausibility screen on the lookup table', () => {
  const rows = readLookupTable(rawDir);
  const row = (cas: string) => rows.find((r) => r.cas === cas)!;

  it('rejects the sec-butylbenzene enthalpy (Trouton ratio near 199 cal/(mol K))', () => {
    expect(screenLookupRow(row('135-98-8'))).toMatchObject({ dhvb: expect.any(String) });
    const e = entry('135-98-8');
    expect(e?.epa2004je?.dhvbCalPerMol).toBeUndefined();
  });
  it('rejects the tert-butylbenzene critical temperature (T_C/T_B 2.76)', () => {
    expect(screenLookupRow(row('98-06-6'))).toMatchObject({ tc: expect.any(String) });
    expect(entry('98-06-6')?.epa2004je).toBeUndefined();
  });
  it('lists every screened value in the generated file', () => {
    const ids = built.screenedEpa2004je.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['135-98-8', '98-06-6']));
  });
  it('passes benzene, trichloroethylene, tetrachloroethylene and elemental mercury', () => {
    for (const cas of ['71-43-2', '79-01-6', '127-18-4', '7439-97-6']) {
      expect(screenLookupRow(row(cas)), cas).toEqual({});
    }
  });
  it('keeps every merged enthalpy inside the Trouton band and every T_C inside the ratio band', () => {
    for (const c of built.chemicals) {
      const e = c.epa2004je;
      if (!e) continue;
      if (e.dhvbCalPerMol !== undefined) {
        const t = e.dhvbCalPerMol / e.tbK;
        expect(t, c.id).toBeGreaterThan(10);
        expect(t, c.id).toBeLessThan(40);
      }
      if (c.id !== '7439-97-6') expect(e.tcK / e.tbK, c.id).toBeLessThan(2.2);
    }
  });
});
