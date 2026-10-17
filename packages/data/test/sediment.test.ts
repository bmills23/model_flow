import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSediment, serialize, type SedimentBuild } from '../src/sediment/build.js';
import { verifySedimentManifest } from '../src/sediment/manifest.js';
import type { BenchmarkRow } from '../src/sediment/types.js';
import { casCheckDigitValid } from '../src/nrwqc/parse.js';
import { parseCsv } from '../src/sediment/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw/sediment');
const generatedFile = resolve(here, '../generated/sediment-2026-10-16/benchmarks.json');

let built: SedimentBuild;
beforeAll(() => {
  built = buildSediment(rawDir);
});

const find = (table: string, id: string, endpoint: string, variant: string | null = null) =>
  built.rows.find(
    (r) =>
      r.table === table && r.chemicalId === id && r.endpoint === endpoint && r.variant === variant,
  );

describe('checksum manifests', () => {
  const copies: string[] = [];
  afterAll(() => copies.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const copy = () => {
    const d = mkdtempSync(join(tmpdir(), 'sediment-'));
    copies.push(d);
    cpSync(rawDir, d, { recursive: true });
    return d;
  };

  it('accepts the committed files of the Region 4 source', () => {
    expect(() => verifySedimentManifest(join(rawDir, 'epa-r4-2018'))).not.toThrow();
  });

  it('records the PDF checksum the methods note recorded on 2026-10-16', () => {
    const m = verifySedimentManifest(join(rawDir, 'epa-r4-2018'));
    const pdf = m.files.find((f) => f.file === 'report.pdf')!;
    expect(pdf.sha256).toBe('7c89bc7c5022595c9c09a79fc6726c173c3d2e7d2607186676e5dd52a42d0889');
    expect(pdf.bytes).toBe(1284613);
  });

  it('fails the build on a checksum mismatch in a CSV', () => {
    const d = copy();
    const file = join(d, 'epa-r4-2018', 'table-2a.csv');
    writeFileSync(file, readFileSync(file, 'utf8').replace('9.8', '9.9'));
    expect(() => verifySedimentManifest(join(d, 'epa-r4-2018'))).toThrow(
      /table-2a\.csv.*checksum/i,
    );
    expect(() => buildSediment(d)).toThrow(/checksum/i);
  });

  it('fails when a listed file is missing', () => {
    const d = copy();
    rmSync(join(d, 'epa-r4-2018', 'table-2b.csv'));
    expect(() => verifySedimentManifest(join(d, 'epa-r4-2018'))).toThrow(/table-2b\.csv/);
  });
});

describe('edition and source blocks', () => {
  it('records the source, its date, and the licence status', () => {
    expect(built.edition).toBe('2026-10-16');
    expect(built.sources.epa2018r4era).toMatchObject({
      reference: 'epa2018r4era',
      pageDate: '2018-03-19',
      retrieved: '2026-10-17',
    });
    expect(built.sources.epa2018r4era.licence).toMatch(/public domain/i);
  });
});

describe('every row', () => {
  it('has a finite positive value, a unit, and a basis of dry weight or 1 percent organic carbon', () => {
    expect(built.rows.length).toBeGreaterThan(500);
    for (const r of built.rows) {
      expect(Number.isFinite(r.value) && r.value > 0, r.id).toBe(true);
      expect(['ug/kg', 'mg/kg'], r.id).toContain(r.unit);
      expect(['dw', 'oc1pct'], r.id).toContain(r.basis);
      expect(r.ocBasis, r.id).toBe(r.basis === 'oc1pct' ? 0.01 : undefined);
      if (r.source === 'epa2018r4era') expect(r.page, r.id).toBeGreaterThanOrEqual(81);
      else expect(r.page, r.id).toBeUndefined();
    }
  });

  it('has unique ids and a valid CAS number where there is one', () => {
    expect(new Set(built.rows.map((r) => r.id)).size).toBe(built.rows.length);
    for (const r of built.rows) {
      if (r.cas !== null) {
        expect(r.cas, r.id).toMatch(/^\d{2,7}-\d{2}-\d$/);
        expect(casCheckDigitValid(r.cas), `${r.name} ${r.cas}`).toBe(true);
        expect(r.chemicalId).toBe(r.cas);
      } else {
        expect(r.chemicalId, r.id).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it('stores no em dash', () => {
    expect(serialize(built)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('Region 4 Table 2a (spot values read from PDF pages 81 to 84)', () => {
  it('arsenic: freshwater 9.8 and 33 mg/kg dry weight, marine 7.24 and 41.6', () => {
    const esv = find('2a', '7440-38-2', 'region4-freshwater-screening')!;
    expect(esv).toMatchObject({
      value: 9.8,
      unit: 'mg/kg',
      basis: 'dw',
      page: 81,
      sourceLetter: 'b',
    });
    expect(find('2a', '7440-38-2', 'region4-freshwater-refinement')!.value).toBe(33);
    expect(find('2a', '7440-38-2', 'region4-marine-screening')!.value).toBe(7.24);
    expect(find('2a', '7440-38-2', 'region4-marine-refinement')!.value).toBe(41.6);
  });

  it('copper and zinc, freshwater and marine', () => {
    expect(find('2a', '7440-50-8', 'region4-freshwater-screening')!.value).toBe(31.6);
    expect(find('2a', '7440-50-8', 'region4-freshwater-refinement')!.value).toBe(149);
    expect(find('2a', '7440-50-8', 'region4-marine-screening')!.value).toBe(18.7);
    expect(find('2a', '7440-66-6', 'region4-freshwater-screening')!.value).toBe(121);
    expect(find('2a', '7440-66-6', 'region4-marine-refinement')!.value).toBe(271);
  });

  it('keeps the thousands separator out of the number: aluminum 25,000 and 58,000, no marine value', () => {
    expect(find('2a', '7429-90-5', 'region4-freshwater-screening')!.value).toBe(25000);
    expect(find('2a', '7429-90-5', 'region4-freshwater-refinement')!.value).toBe(58000);
    expect(find('2a', '7429-90-5', 'region4-marine-screening')).toBeUndefined();
  });

  it('keeps aquatic life and wildlife based mercury as separate variants of one CAS number', () => {
    expect(
      find('2a', '7439-97-6', 'region4-freshwater-screening', 'inorganic - aquatic life')!.value,
    ).toBe(0.18);
    expect(
      find('2a', '7439-97-6', 'region4-freshwater-screening', 'inorganic - wildlife based')!.value,
    ).toBe(0.17);
  });

  it('puts a blank cell in the right column: acrylonitrile has marine refinement only', () => {
    expect(find('2a', '107-13-1', 'region4-marine-screening')).toBeUndefined();
    expect(find('2a', '107-13-1', 'region4-marine-refinement')!.value).toBe(151);
    expect(find('2a', '107-13-1', 'region4-freshwater-screening')!.value).toBe(30);
  });

  it('phenol is at 1 percent organic carbon (source d), marine 63 and 420', () => {
    const p = find('2a', '108-95-2', 'region4-freshwater-screening')!;
    expect(p).toMatchObject({
      value: 175,
      unit: 'ug/kg',
      basis: 'oc1pct',
      ocBasis: 0.01,
      sourceLetter: 'd',
    });
    expect(find('2a', '108-95-2', 'region4-marine-refinement')!.value).toBe(420);
  });

  it('total PCBs: 59.8 and 676 dry weight from the MacDonald based source', () => {
    expect(find('2a', '1336-36-3', 'region4-freshwater-screening', null)).toMatchObject({
      value: 59.8,
      basis: 'dw',
      page: 84,
    });
    expect(find('2a', '1336-36-3', 'region4-freshwater-refinement')!.value).toBe(676);
    expect(find('2a', '1336-36-3', 'region4-marine-screening')!.value).toBe(21.6);
  });

  it('reads the code rows with no CAS number: total DDD, source b, dry weight', () => {
    const r = built.rows.find((x) => x.table === '2a' && x.name.startsWith('Total DDD'))!;
    expect(r.cas).toBeNull();
    expect(r.code).toBe('DDD');
    expect(r.value).toBe(4.9);
    expect(r.basis).toBe('dw');
  });

  it('corrects the transposed CAS number of sulfides and keeps the printed one', () => {
    const r = find('2a', '18496-25-8', 'region4-freshwater-screening')!;
    expect(r.casPrinted).toBe('18946-25-8');
    expect(r.value).toBe(39);
  });

  it('repairs the CAS number printed with a stray space (monobutyltin)', () => {
    expect(find('2a', '78763-54-9', 'region4-freshwater-screening')!.value).toBe(0.54);
  });
});

describe('Region 4 Table 2b', () => {
  it('benzene: 10 (source i, dry weight) and 2,185 (source c, 1 percent organic carbon), marine 111', () => {
    expect(find('2b', '71-43-2', 'region4-freshwater-screening')).toMatchObject({
      value: 10,
      basis: 'dw',
      unit: 'ug/kg',
      sourceLetter: 'i',
    });
    expect(find('2b', '71-43-2', 'region4-freshwater-refinement')).toMatchObject({
      value: 2185,
      basis: 'oc1pct',
      ocBasis: 0.01,
    });
    expect(find('2b', '71-43-2', 'region4-marine-screening')).toMatchObject({
      value: 111,
      basis: 'oc1pct',
    });
  });

  it('PAH screening values are dry weight (source f) and have no refinement value ("*")', () => {
    expect(find('2b', '91-20-3', 'region4-freshwater-screening')).toMatchObject({
      value: 176,
      basis: 'dw',
    });
    expect(find('2b', '91-20-3', 'region4-marine-screening')!.value).toBe(35);
    expect(find('2b', '91-20-3', 'region4-freshwater-refinement')).toBeUndefined();
  });

  it('total PAHs 1,610 freshwater and 1,684 marine, no CAS number', () => {
    const fw = built.rows.find(
      (r) =>
        r.table === '2b' &&
        r.name === 'Total PAHs' &&
        r.endpoint === 'region4-freshwater-screening',
    )!;
    expect(fw.value).toBe(1610);
    expect(fw.cas).toBeNull();
    const m = built.rows.find(
      (r) =>
        r.table === '2b' && r.name === 'Total PAHs' && r.endpoint === 'region4-marine-screening',
    )!;
    expect(m.value).toBe(1684);
  });
});

describe('Region 4 basis from the cell shading (gray is dry weight, notes on PDF pages 84 and 87)', () => {
  const byName = (table: string, name: string, endpoint: string) =>
    built.rows.find((r) => r.table === table && r.name === name && r.endpoint === endpoint)!;
  const shadeRows = (file: string) =>
    parseCsv(readFileSync(join(rawDir, 'epa-r4-2018', file), 'utf8'));

  it('records a shade for every printed value of Tables 2a, 2b and 2c', () => {
    for (const file of ['table-2a.csv', 'table-2b.csv']) {
      for (const r of shadeRows(file)) {
        for (const c of ['fwEsv', 'fwRsv', 'mEsv', 'mRsv']) {
          if (r[c] === '') expect(r[`${c}Shade`], `${file} ${r['chemical']} ${c}`).toBe('');
          else
            expect(['none', 'gray', 'tan'], `${file} ${r['chemical']} ${c}`).toContain(
              r[`${c}Shade`],
            );
        }
      }
    }
    for (const r of shadeRows('table-2c.csv')) expect(r['rsvShade'], r['chemical']).toBe('none');
  });

  it('benzo(a)pyrene marine 89 (source d, unshaded) is at 1 percent OC, page 86', () => {
    const r = find('2b', '50-32-8', 'region4-marine-screening')!;
    expect(r).toMatchObject({ value: 89, basis: 'oc1pct', ocBasis: 0.01, page: 86 });
    expect(r.basisInferred).toBeUndefined();
    // f_oc 0.05, 445 ug/kg dw: the benchmark at the site is 89 x 0.05 / 0.01 = 445, a ratio of 1.
    expect((445 / (r.value * (0.05 / r.ocBasis!))).toFixed(3)).toBe('1.000');
    // The freshwater 150 (source f) is gray: dry weight.
    expect(find('2b', '50-32-8', 'region4-freshwater-screening')).toMatchObject({
      value: 150,
      basis: 'dw',
    });
  });

  it('chrysene 108 and bis(2-ethylhexyl)phthalate 182 and 2,647 (source d, unshaded) are at 1 percent OC', () => {
    expect(find('2b', '218-01-9', 'region4-marine-screening')).toMatchObject({
      value: 108,
      basis: 'oc1pct',
    });
    expect(find('2b', '117-81-7', 'region4-marine-screening')).toMatchObject({
      value: 182,
      basis: 'oc1pct',
    });
    expect(find('2b', '117-81-7', 'region4-marine-refinement')).toMatchObject({
      value: 2647,
      basis: 'oc1pct',
    });
    expect(find('2b', '117-81-7', 'region4-freshwater-screening')).toMatchObject({
      value: 180,
      basis: 'dw',
    });
  });

  it('bis(2-ethylhexyl)phthalate freshwater 2,600 is unshaded: 1 percent OC, flagged because note f says dry weight', () => {
    expect(find('2b', '117-81-7', 'region4-freshwater-refinement')).toMatchObject({
      value: 2600,
      basis: 'oc1pct',
      sourceLetter: 'f',
      basisInferred: true,
    });
  });

  it('every individual compound marine value with source d in Table 2b is at 1 percent OC', () => {
    const d = built.rows.filter(
      (r) =>
        r.table === '2b' &&
        r.sourceLetter === 'd' &&
        r.waterType === 'salt' &&
        !r.name.startsWith('Total'),
    );
    expect(d.length).toBe(16);
    for (const r of d) expect(r.basis, r.id).toBe('oc1pct');
  });

  it('the PAH totals: gray 312 is dry weight; the tan 600, 1,000, 1,610, 655 and 1,684 are shaded, dry weight, flagged', () => {
    expect(byName('2b', 'Total LMW-PAHs', 'region4-marine-screening')).toMatchObject({
      value: 312,
      basis: 'dw',
    });
    expect(
      byName('2b', 'Total LMW-PAHs', 'region4-marine-screening').basisInferred,
    ).toBeUndefined();
    for (const [name, endpoint, value] of [
      ['Total LMW-PAHs', 'region4-freshwater-screening', 600],
      ['Total HMW-PAHs', 'region4-freshwater-screening', 1000],
      ['Total PAHs', 'region4-freshwater-screening', 1610],
      ['Total HMW-PAHs', 'region4-marine-screening', 655],
      ['Total PAHs', 'region4-marine-screening', 1684],
    ] as const) {
      expect(byName('2b', name, endpoint), name).toMatchObject({
        value,
        basis: 'dw',
        basisInferred: true,
      });
    }
  });

  it('spot checks in Table 2a: the shade decides, a note that states the other unit flags the value', () => {
    // Carbaryl freshwater 6 (source l, gray, page 83): dry weight as note l states.
    const carbaryl = find('2a', '63-25-2', 'region4-freshwater-refinement')!;
    expect(carbaryl).toMatchObject({ value: 6, basis: 'dw', page: 83 });
    expect(carbaryl.basisInferred).toBeUndefined();
    // Chlordane marine 2.7 (source c, gray): dry weight.
    expect(find('2a', '57-74-9', 'region4-marine-screening', null)).toMatchObject({
      value: 2.7,
      basis: 'dw',
    });
    // Dicamba marine 630 (source l, unshaded): 1 percent OC, flagged.
    expect(find('2a', '1918-00-9', 'region4-marine-refinement')).toMatchObject({
      value: 630,
      basis: 'oc1pct',
      basisInferred: true,
    });
    // Heptachlor freshwater 0.6 (source j, CCME dw, unshaded): 1 percent OC, flagged.
    expect(find('2a', '76-44-8', 'region4-freshwater-screening')).toMatchObject({
      value: 0.6,
      basis: 'oc1pct',
      basisInferred: true,
    });
    // Dioxins/furans 0.0025 (source k, gray, page 84): dry weight.
    expect(find('2a', '1746-01-6', 'region4-freshwater-screening', null)).toMatchObject({
      value: 0.0025,
      basis: 'dw',
      page: 84,
    });
    // Phenol 175 (source d, unshaded): 1 percent OC, as note d states.
    const phenol = find('2a', '108-95-2', 'region4-freshwater-screening')!;
    expect(phenol.basis).toBe('oc1pct');
    expect(phenol.basisInferred).toBeUndefined();
  });

  it('benzene 10 (source i, gray, page 85) is dry weight and its 2,185 (source c, unshaded) is at 1 percent OC', () => {
    expect(find('2b', '71-43-2', 'region4-freshwater-screening')).toMatchObject({
      value: 10,
      basis: 'dw',
      page: 85,
    });
    expect(find('2b', '71-43-2', 'region4-freshwater-refinement')!.basis).toBe('oc1pct');
  });
});

describe('Region 4 Table 2c', () => {
  it('holds the toxic unit refinement values at 1 percent organic carbon', () => {
    expect(find('2c', '91-20-3', 'region4-pah-toxic-unit-refinement')).toMatchObject({
      value: 3850,
      basis: 'oc1pct',
      ocBasis: 0.01,
      page: 88,
    });
    expect(find('2c', '50-32-8', 'region4-pah-toxic-unit-refinement')!.value).toBe(9650);
    expect(find('2c', '53-70-3', 'region4-pah-toxic-unit-refinement')!.value).toBe(11200);
    expect(built.rows.filter((r) => r.table === '2c').length).toBe(49);
  });
});

describe('MacDonald et al. (2000) consensus guidelines (not shipped)', () => {
  it('carries no MacDonald row, source block, raw directory or endpoint', () => {
    expect(built.rows.filter((r) => (r.source as string) === 'macdonald2000')).toEqual([]);
    expect(built.rows.filter((r) => (r.table as string) === 'tec-pec')).toEqual([]);
    expect(built.rows.filter((r) => r.endpoint.startsWith('macdonald'))).toEqual([]);
    expect(Object.keys(built.sources)).toEqual(['epa2018r4era']);
    expect(existsSync(join(rawDir, 'macdonald2000'))).toBe(false);
  });
});

describe('generated file', () => {
  it('matches a fresh build byte for byte', () => {
    expect(readFileSync(generatedFile, 'utf8')).toBe(serialize(built));
  });

  it('is shaped like the engine criterion record (sediment medium, database source)', () => {
    const r: BenchmarkRow = built.rows[0]!;
    expect(r.medium).toBe('sediment');
    expect(r.source).toBe('epa2018r4era');
    expect(r.recordSource).toBe('database');
  });
});
