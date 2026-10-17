import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildNrwqc, serialize, type NrwqcBuild } from '../src/nrwqc/build.js';
import { casCheckDigitValid, parseCas } from '../src/nrwqc/parse.js';
import { verifyManifest } from '../src/nrwqc/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw/nrwqc/2026-10-16');
const generatedDir = resolve(here, '../generated/nrwqc-2026-10-16');

let built: NrwqcBuild;
beforeAll(() => {
  built = buildNrwqc(rawDir);
});

const aq = (id: string) => built.aquatic.rows.find((r) => r.id === id);
const byName = (name: string) => built.aquatic.rows.find((r) => r.name === name);

describe('checksum manifest', () => {
  const copies: string[] = [];
  afterAll(() => copies.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const copy = () => {
    const d = mkdtempSync(join(tmpdir(), 'nrwqc-'));
    copies.push(d);
    cpSync(rawDir, d, { recursive: true });
    return d;
  };

  it('accepts the committed files', () => {
    expect(() => verifyManifest(rawDir)).not.toThrow();
  });

  it('fails the build on a checksum mismatch', () => {
    const d = copy();
    const file = join(d, 'aquatic-life.html');
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    writeFileSync(file, bytes);
    expect(() => verifyManifest(d)).toThrow(/aquatic-life\.html.*checksum/i);
    expect(() => buildNrwqc(d)).toThrow(/checksum/i);
  });

  it('fails when a listed file is missing', () => {
    const d = copy();
    rmSync(join(d, 'human-health.html'));
    expect(() => verifyManifest(d)).toThrow(/human-health\.html/);
  });
});

describe('CAS numbers', () => {
  it('checks the digit', () => {
    expect(casCheckDigitValid('7440-66-6')).toBe(true);
    expect(casCheckDigitValid('7440-66-7')).toBe(false);
  });

  it('hyphenates the printed digits and checks them', () => {
    expect(parseCas('7440666')).toEqual(['7440-66-6']);
    expect(parseCas('50293')).toEqual(['50-29-3']);
    expect(() => parseCas('7440667')).toThrow(/check digit/i);
  });

  it('splits a run of two CAS numbers and a list', () => {
    expect(parseCas('743997622967926')).toEqual(['7439-97-6', '22967-92-6']);
    expect(parseCas('45285-51-6; 335-67-1')).toEqual(['45285-51-6', '335-67-1']);
  });

  it('has no CAS number for a dash or an empty cell', () => {
    expect(parseCas('\u2014')).toEqual([]);
    expect(parseCas('')).toEqual([]);
  });

  it('gives every chemical row at least one CAS number, hyphenated with a valid check digit', () => {
    for (const rows of [built.aquatic.rows, built.humanHealth.rows]) {
      const chemicals = rows.filter((r) => r.kind === 'chemical');
      expect(chemicals.length).toBeGreaterThan(40);
      for (const r of chemicals) {
        expect(r.cas.length, r.name).toBeGreaterThan(0);
        for (const c of r.cas) {
          expect(c, r.name).toMatch(/^\d{2,7}-\d{2}-\d$/);
          expect(casCheckDigitValid(c), `${r.name} ${c}`).toBe(true);
        }
      }
    }
  });

  it('keeps row ids unique', () => {
    for (const rows of [built.aquatic.rows, built.humanHealth.rows]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
  });
});

describe('aquatic life table', () => {
  it('records edition, source and units', () => {
    expect(built.aquatic.edition).toBe('2026-10-16');
    expect(built.aquatic.source).toMatchObject({
      reference: 'epanrwqc',
      pageDate: '2026-06-09',
      retrieved: '2026-10-17',
    });
    expect(built.aquatic.source.url).toMatch(/aquatic-life-criteria-table$/);
    expect(built.aquatic.units.criterion).toBe('ug/L');
    expect(built.humanHealth.source).toMatchObject({
      reference: 'epanrwqchh',
      pageDate: '2025-12-18',
    });
  });

  it('reads zinc: freshwater 120 and 120, saltwater 90 and 81', () => {
    const zn = aq('7440-66-6')!;
    expect(zn.name).toBe('Zinc');
    expect(zn.freshwater.cmc.value).toBe(120);
    expect(zn.freshwater.ccc.value).toBe(120);
    expect(zn.saltwater.cmc.value).toBe(90);
    expect(zn.saltwater.ccc.value).toBe(81);
    expect(zn.hardnessDependent).toBe(true);
    expect(zn.priority).toBe(true);
  });

  it('reads thousands separators, unit suffixes, absent values and a vacated criterion', () => {
    expect(aq('18540-29-9')!.saltwater.cmc.value).toBe(1100);
    expect(aq('107-02-8')!.freshwater.cmc).toMatchObject({ value: 3, unit: 'ug/L' });
    expect(aq('7440-43-9')!.freshwater.ccc.status).toBe('vacated');
    expect(aq('309-00-2')!.freshwater.ccc.status).toBe('none');
  });

  it('flags copper, aluminum and ammonia as site-specific, in the water types that need it', () => {
    const cu = aq('7440-50-8')!;
    expect(cu.siteSpecific).toBe(true);
    expect(cu.siteSpecificFor).toEqual(['fresh']);
    expect(cu.saltwater.cmc.value).toBe(4.8);
    expect(aq('7429-90-5')!.siteSpecific).toBe(true);
    expect(aq('7664-41-7')!.siteSpecific).toBe(true);
    expect(aq('7440-66-6')!.siteSpecific).toBe(false);
    expect(aq('7782-49-2')!.siteSpecificFor).toEqual(['fresh']);
  });

  it('marks aluminum site-specific for freshwater only: the page tabulates no saltwater criterion', () => {
    expect(aq('7429-90-5')!.siteSpecificFor).toEqual(['fresh']);
    expect(aq('7664-41-7')!.siteSpecificFor).toEqual(['fresh', 'salt']);
  });

  it('flags the pH-dependent pentachlorophenol freshwater values with the pH they are printed at', () => {
    const pcp = aq('87-86-5')!;
    expect(pcp.freshwater.cmc.value).toBe(19);
    expect(pcp.freshwater.ccc.value).toBe(15);
    expect(pcp.phDependentFor).toEqual(['fresh']);
    expect(pcp.printedAtPh).toBe(7.8);
    const others = built.aquatic.rows.filter((r) => r.id !== '87-86-5');
    expect(others.every((r) => r.phDependentFor.length === 0 && r.printedAtPh === undefined)).toBe(
      true,
    );
  });

  it('keeps non-chemical rows as parameters, and chemicals without a CAS number as groups', () => {
    expect(byName('Temperature')!.kind).toBe('parameter');
    expect(byName('pH')!.kind).toBe('parameter');
    expect(byName('Color')!.kind).toBe('parameter');
    expect(byName('Phosphorus Elemental')!.kind).toBe('chemical');
    expect(built.humanHealth.rows.find((r) => r.name === 'Phenol')!.kind).toBe('chemical');
    expect(byName('Tributyltin (TBT)')!.kind).toBe('group');
    expect(byName('Tributyltin (TBT)')!.freshwater.cmc.value).toBe(0.46);
  });

  it('reads the PFOA water value and tissue values', () => {
    const pfoa = built.aquatic.rows.find((r) => r.name.startsWith('Perfluorooctanoic'))!;
    expect(pfoa.cas).toEqual(['45285-51-6', '335-67-1', '3825-26-1']);
    expect(pfoa.freshwater.ccc.value).toBe(100);
    expect(pfoa.freshwater.ccc.tissue?.[0]).toMatchObject({ value: 1.18, unit: 'mg/kg' });
    expect(pfoa.freshwater.ccc.tissue).toHaveLength(3);
  });

  it('writes no em dash anywhere in the generated text', () => {
    for (const file of [built.aquatic, built.humanHealth, built.hardness]) {
      expect(serialize(file)).not.toContain('\u2014');
    }
  });
});

describe('human health table', () => {
  const hh = (id: string) => built.humanHealth.rows.find((r) => r.id === id);

  it('reads water plus organism and organism only', () => {
    const benzo = hh('50-32-8')!;
    expect(benzo.waterAndOrganism.value).toBe(0.00012);
    expect(benzo.organismOnly.value).toBe(0.00013);
    expect(hh('7440-66-6')!.waterAndOrganism.value).toBe(7400);
    expect(hh('7440-66-6')!.organismOnly.value).toBe(26000);
    expect(hh('1746-01-6')!.waterAndOrganism.value).toBe(5e-9);
  });

  it('reads a range, a non-ug/L unit and a non-numeric entry', () => {
    expect(hh('71-43-2')!.waterAndOrganism).toMatchObject({ value: 0.58, valueHigh: 2.1 });
    expect(hh('1332-21-4')!.waterAndOrganism).toMatchObject({ unit: 'million fibers/L', value: 7 });
    expect(hh('22967-92-6')!.organismOnly).toMatchObject({ unit: 'mg/kg', value: 0.3 });
    expect(hh('16065-83-1')!.waterAndOrganism.status).toBe('text');
  });
});

describe('hardness parameters', () => {
  it('has the six Appendix B metals', () => {
    expect(built.hardness.metals.map((m) => m.name)).toEqual([
      'Cadmium',
      'Chromium III',
      'Lead',
      'Nickel',
      'Silver',
      'Zinc',
    ]);
    for (const m of built.hardness.metals) expect(aq(m.id)?.hardnessDependent, m.name).toBe(true);
  });

  it('carries the conversion factors of Appendix A, hardness-dependent where printed', () => {
    const cd = built.hardness.conversionFactors.find((c) => c.name === 'Cadmium')!;
    expect(cd.freshwater.cmc).toEqual({ intercept: 1.136672, slope: -0.041838 });
    expect(cd.saltwater.cmc).toEqual({ constant: 0.994 });
    expect(
      built.hardness.conversionFactors.find((c) => c.name === 'Selenium')!.freshwater.cmc,
    ).toBeNull();
  });

  it('reproduces each printed freshwater value at 100 mg/L to two significant figures', () => {
    const at = (eq: { slope: number; intercept: number; conversionFactor: unknown }) => {
      const cf = eq.conversionFactor as { constant: number } | { intercept: number; slope: number };
      const f = 'constant' in cf ? cf.constant : cf.intercept + cf.slope * Math.log(100);
      return Math.exp(eq.slope * Math.log(100) + eq.intercept) * f;
    };
    let checked = 0;
    for (const m of built.hardness.metals) {
      const row = aq(m.id)!;
      for (const [eq, printed] of [
        [m.freshwater.acute, row.freshwater.cmc.value],
        [m.freshwater.chronic, row.freshwater.ccc.value],
      ] as const) {
        if (!eq) continue;
        expect(printed, `${m.name} printed`).toBeDefined();
        expect(Number(at(eq).toPrecision(2)), m.name).toBe(Number(printed!.toPrecision(2)));
        checked++;
      }
    }
    // cadmium and silver acute only, the other four metals both: 2 + 8 = 10
    expect(checked).toBe(10);
  });
});

describe('generated output', () => {
  it('matches the committed JSON byte for byte', () => {
    expect(readFileSync(join(generatedDir, 'aquatic.json'), 'utf8')).toBe(serialize(built.aquatic));
    expect(readFileSync(join(generatedDir, 'human-health.json'), 'utf8')).toBe(
      serialize(built.humanHealth),
    );
    expect(readFileSync(join(generatedDir, 'hardness.json'), 'utf8')).toBe(
      serialize(built.hardness),
    );
  });
});
