import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildCriteria,
  generatedParts,
  serializeSet,
  type CriteriaBuild,
} from '../src/criteria/build.js';
import { verifyCriteriaManifest } from '../src/criteria/manifest.js';
import type { CriteriaRow, CriteriaSetFile } from '../src/criteria/types.js';
import { references } from '@model-flow/engine';
import { GROUP_POINTERS, assertTwinRows, mergeNotes } from '../src/criteria/build.js';
import { casCheckDigitValid } from '../src/nrwqc/parse.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw');
const generatedDir = resolve(here, '../generated');

let built: CriteriaBuild;
beforeAll(() => {
  built = buildCriteria(rawDir, generatedDir);
});

const rowsOf = (set: keyof CriteriaBuild['sets']): CriteriaRow[] => built.sets[set].rows;
const find = (
  set: keyof CriteriaBuild['sets'],
  chemicalId: string,
  medium: string,
  waterType: string,
  basis: string,
): CriteriaRow | undefined =>
  rowsOf(set).find(
    (r) =>
      r.chemicalId === chemicalId &&
      r.medium === medium &&
      r.waterType === waterType &&
      r.basis === basis,
  );

describe('checksum manifest', () => {
  const copies: string[] = [];
  afterAll(() => copies.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const copy = () => {
    const d = mkdtempSync(join(tmpdir(), 'criteria-'));
    copies.push(d);
    cpSync(rawDir, d, { recursive: true });
    return d;
  };

  it('accepts the committed files', () => {
    const m = verifyCriteriaManifest(rawDir);
    expect(Object.keys(m.sets).sort()).toEqual([
      'anzg',
      'ccme',
      'eu',
      'eu2026',
      'macdonald2000',
      'uk',
    ]);
  });

  it('fails the build on a checksum mismatch in a CSV', () => {
    const d = copy();
    const file = join(d, 'ccme', 'ccme.csv');
    writeFileSync(file, readFileSync(file, 'utf8').replace(',370,', ',371,'));
    expect(() => verifyCriteriaManifest(d)).toThrow(/ccme\.csv.*checksum/i);
    expect(() => buildCriteria(d, generatedDir)).toThrow(/checksum/i);
  });

  it('fails when a listed file is missing', () => {
    const d = copy();
    rmSync(join(d, 'macdonald2000', 'consensus-tec-pec.csv'));
    expect(() => verifyCriteriaManifest(d)).toThrow(/consensus-tec-pec\.csv/);
  });
});

describe('source blocks', () => {
  it('records the edition, the retrieval date, a reference and the terms of each set', () => {
    expect(Object.keys(built.sets).sort()).toEqual([
      'anzg',
      'ccme',
      'eu',
      'eu2026',
      'macdonald2000',
      'uk',
    ]);
    for (const f of Object.values(built.sets) as CriteriaSetFile[]) {
      expect(f.edition).toBe('2026-10-23');
      expect(f.source.retrieved).toBe('2026-10-23');
      expect(f.source.references.length).toBeGreaterThan(0);
      expect(f.source.terms.length).toBeGreaterThan(20);
      expect(f.source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(built.sets.ccme.source.redistributed).toBe(false);
    expect(built.sets.anzg.source.redistributed).toBe(false);
    expect(built.sets.macdonald2000.source.redistributed).toBe(false);
    expect(built.sets.eu.source.redistributed).toBe(true);
    expect(built.sets.eu2026.source.redistributed).toBe(true);
    expect(built.sets.uk.source.redistributed).toBe(true);
  });
});

describe('references', () => {
  it('cites only entries of references.json that are registered as data', () => {
    const byKey = new Map(references.map((r) => [r.key, r]));
    for (const [set, f] of Object.entries(built.sets) as [string, CriteriaSetFile][]) {
      for (const key of f.source.references) {
        expect(byKey.get(key)?.status, `${set} cites ${key}`).toBe('data');
      }
    }
    expect(byKey.get('macdonald2000')?.status).toBe('data');
  });
});

describe('every row', () => {
  it('has a unit that matches its medium, and a finite non-negative value unless site-specific', () => {
    for (const set of Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[]) {
      expect(rowsOf(set).length, set).toBeGreaterThan(40);
      for (const r of rowsOf(set)) {
        if (r.medium === 'surfaceWater') expect(['ug/L', 'mg/L'], r.id).toContain(r.unit);
        else expect(['ug/kg', 'mg/kg'], r.id).toContain(r.unit);
        expect(['fresh', 'salt'], r.id).toContain(r.waterType);
        if (r.siteSpecific === true) expect(r.value, r.id).toBeUndefined();
        else {
          expect(Number.isFinite(r.value) && (r.value ?? -1) >= 0, r.id).toBe(true);
          expect(r.printedValue, r.id).toBeDefined();
        }
        expect(r.basisLabel.length, r.id).toBeGreaterThan(0);
        expect(r.table.length, r.id).toBeGreaterThan(0);
      }
    }
  });

  it('has unique ids inside a set, and no chemical id outside the CAS, code or slug forms', () => {
    for (const set of Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[]) {
      const ids = rowsOf(set).map((r) => r.id);
      expect(new Set(ids).size, set).toBe(ids.length);
      for (const r of rowsOf(set)) {
        expect(r.chemicalId, r.id).toMatch(/^(\d{2,7}-\d{2}-\d|[a-z0-9]+(-[a-z0-9]+)*)$/);
        expect(r.set).toBe(set);
      }
    }
  });

  it('keeps a CAS number only in hyphenated form, flagging the two the sources misprint', () => {
    const unverified = new Set<string>();
    for (const set of Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[]) {
      for (const r of rowsOf(set)) {
        if (r.cas === null) continue;
        expect(r.cas, r.id).toMatch(/^[1-9]\d{1,6}-\d{2}-\d$/);
        if (!casCheckDigitValid(r.cas)) {
          unverified.add(r.cas);
          expect(r.casUnverified, r.id).toBe(true);
        } else expect(r.casUnverified, r.id).toBeUndefined();
      }
    }
    expect([...unverified].sort()).toEqual(['13826-41-3', '7440-62-3']);
  });

  it('strips the leading zero a spreadsheet added to two ANZG CAS numbers and keeps the printed form', () => {
    const anthracene = rowsOf('anzg').filter((r) => r.casPrinted === '0120-12-7');
    expect(anthracene.length).toBeGreaterThan(0);
    for (const r of anthracene) expect(r.cas).toBe('120-12-7');
  });

  it('stores no em dash', () => {
    for (const f of Object.values(built.sets) as CriteriaSetFile[]) {
      expect(serializeSet(f)).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe('Canada (CCME)', () => {
  it('holds benzene and benzo[a]pyrene as the fetched table prints them, in the SI-ready units', () => {
    expect(find('ccme', '71-43-2', 'surfaceWater', 'fresh', 'long-term')).toMatchObject({
      value: 370,
      unit: 'ug/L',
    });
    expect(find('ccme', '71-43-2', 'surfaceWater', 'salt', 'long-term')?.value).toBe(110);
    expect(find('ccme', '50-32-8', 'sediment', 'fresh', 'ISQG')).toMatchObject({
      value: 31.9,
      unit: 'ug/kg',
    });
    expect(find('ccme', '50-32-8', 'sediment', 'salt', 'PEL')?.value).toBe(763);
  });

  it('turns a printed Equation, Variable or Table into a site-specific row with no value', () => {
    const cd = find('ccme', '7440-43-9', 'surfaceWater', 'fresh', 'long-term');
    expect(cd).toMatchObject({ siteSpecific: true });
    expect(cd?.value).toBeUndefined();
    expect(find('ccme', '7440-66-6', 'surfaceWater', 'fresh', 'short-term')?.siteSpecific).toBe(
      true,
    );
  });

  it('drops narrative and framework cells, which have no number to compare', () => {
    expect(rowsOf('ccme').some((r) => /^(Colour|Temperature|Turbidity)$/.test(r.name))).toBe(false);
    expect(rowsOf('ccme').filter((r) => r.value === undefined && r.siteSpecific !== true)).toEqual(
      [],
    );
  });

  it('converts the dioxin sediment guideline from ng TEQ/kg to ug/kg and says so', () => {
    const d = rowsOf('ccme').find(
      (r) => /dibenzo-p-dioxins/i.test(r.name) && r.basis === 'ISQG' && r.waterType === 'fresh',
    );
    expect(d?.value).toBeCloseTo(0.00085, 12);
    expect(d?.unit).toBe('ug/kg');
    expect(d?.printedUnit).toMatch(/TEQ/);
    expect(d?.chemicalId).toMatch(/^polychlorinated/);
  });
});

describe('European Union (Directive 2008/105/EC Annex I Part A, as amended)', () => {
  it('maps inland surface waters to fresh and other surface waters to salt', () => {
    expect(find('eu', '15972-60-8', 'surfaceWater', 'fresh', 'AA-EQS inland')).toMatchObject({
      value: 0.3,
      unit: 'ug/L',
    });
    expect(
      find('eu', '15972-60-8', 'surfaceWater', 'salt', 'MAC-EQS other surface waters'),
    ).toMatchObject({
      value: 0.7,
    });
  });

  it('keeps one row per cadmium hardness class', () => {
    const cd = rowsOf('eu').filter(
      (r) => r.chemicalId === '7440-43-9' && r.basis.startsWith('AA-EQS inland'),
    );
    expect(cd).toHaveLength(5);
    expect(new Set(cd.map((r) => r.basis)).size).toBe(5);
  });

  it('has no sediment rows', () => {
    expect(rowsOf('eu').every((r) => r.medium === 'surfaceWater')).toBe(true);
  });
});

describe('European Union as amended by Directive (EU) 2026/805 (eu2026)', () => {
  it('is a set of its own beside the 2013 set, with its own label and references', () => {
    const f = built.sets.eu2026;
    expect(f.set).toBe('eu2026');
    expect(f.label).toBe(
      'European Union (Directive 2008/105/EC as amended by Directive (EU) 2026/805)',
    );
    expect(f.media).toEqual(['surfaceWater']);
    expect(f.source.references).toEqual(['eudir2008105', 'eudir201339', 'eudir2026805']);
    expect(f.source.url).toBe('http://publications.europa.eu/resource/celex/02008L0105-20260510');
    expect(built.sets.eu.label).toBe('European Union (Directive 2008/105/EC)');
  });

  it('holds 270 rows for the 272 water rows of the fetched text (two printed twice are merged), and the 2013 set keeps its 180', () => {
    expect(rowsOf('eu2026')).toHaveLength(270);
    expect(rowsOf('eu')).toHaveLength(180);
    expect(rowsOf('eu2026').every((r) => r.medium === 'surfaceWater')).toBe(true);
  });

  it('keeps the new PFAS, glyphosate and silver rows, each as its own basis', () => {
    expect(
      find(
        'eu2026',
        '1071-83-6',
        'surfaceWater',
        'fresh',
        'AA-EQS inland, drinking water abstraction',
      )?.value,
    ).toBe(0.1);
    expect(
      find(
        'eu2026',
        '1071-83-6',
        'surfaceWater',
        'fresh',
        'AA-EQS inland, not drinking water abstraction',
      )?.value,
    ).toBe(86.7);
    const silver = rowsOf('eu2026').filter(
      (r) => r.chemicalId === '7440-22-4' && r.waterType === 'salt',
    );
    expect(silver.map((r) => r.value).sort()).toEqual([0.006, 0.17]);
    expect(rowsOf('eu')).not.toContainEqual(expect.objectContaining({ chemicalId: '1071-83-6' }));
  });

  it('puts the date of application in the note of a revised or new standard', () => {
    const f = built.sets.eu2026;
    const note = (r: CriteriaRow | undefined): string =>
      r?.note !== undefined ? f.notes[r.note]! : '';
    expect(note(find('eu2026', '2921-88-2', 'surfaceWater', 'fresh', 'AA-EQS inland'))).toMatch(
      /from 22 December 2027, good surface water chemical status to be achieved by 22 December 2033/,
    );
    expect(
      note(find('eu2026', '1071-83-6', 'surfaceWater', 'salt', 'AA-EQS other surface waters')),
    ).toMatch(/22 December 2039/);
  });

  it('carries the six moved substances from Annex II Part C at their unchanged values', () => {
    const c = rowsOf('eu2026').filter((r) => r.table === 'Annex II Part C table');
    expect(c).toHaveLength(20);
    const atrazine = c.filter((r) => r.chemicalId === '1912-24-9');
    const old = rowsOf('eu').filter((r) => r.chemicalId === '1912-24-9');
    expect(atrazine.map((r) => [r.basis, r.value]).sort()).toEqual(
      old.map((r) => [r.basis, r.value]).sort(),
    );
  });

  it('gives the UK triclosan row the CAS number the revised EU set prints, by a unique name join', () => {
    const t = rowsOf('uk').filter((r) => r.name === 'Triclosan');
    expect(t.length).toBeGreaterThan(0);
    for (const r of t) expect([r.chemicalId, r.idBy]).toEqual(['3380-34-5', 'name-join']);
  });

  it('takes the first printed CAS number where a second one is an alternate number of the same substance', () => {
    const cases: [string, string, string][] = [
      ['Imidacloprid', '138261-41-3', '138261-41-3;105827-78-9'],
      ['Acetamiprid', '135410-20-7', '135410-20-7;160430-64-8'],
      ['Diclofenac', '15307-86-5', '15307-86-5;15307-79-6'],
    ];
    for (const [name, cas, printed] of cases) {
      const rs = rowsOf('eu2026').filter((r) => r.name === name);
      expect(rs.length, name).toBeGreaterThan(0);
      for (const r of rs) {
        expect([r.chemicalId, r.idBy, r.cas, r.casPrinted], r.id).toEqual([
          cas,
          'cas',
          cas,
          printed,
        ]);
        expect(casCheckDigitValid(cas)).toBe(true);
        expect(r.casUnverified, r.id).toBeUndefined();
      }
    }
    // The CCME misprint is untouched, and a genuine group still has no single CAS number.
    expect(rowsOf('ccme').some((r) => r.cas === '13826-41-3' && r.casUnverified === true)).toBe(
      true,
    );
    const hept = rowsOf('eu2026').filter((r) => /^Heptachlor/.test(r.name));
    expect(hept.length).toBeGreaterThan(0);
    for (const r of hept)
      expect([r.cas, r.idBy, r.chemicalId]).toEqual([
        null,
        'name',
        'heptachlor-and-heptachlor-epoxide',
      ]);
  });

  it('keeps PFOS out of the water rows (it points to the PFAS group)', () => {
    expect(rowsOf('eu2026').some((r) => /perfluorooctane sulfonic|PFOS/i.test(r.name))).toBe(false);
  });
});

describe('United Kingdom (Standards and Classification Directions 2015)', () => {
  it('equals the European value for a priority substance', () => {
    const uk = find('uk', '15972-60-8', 'surfaceWater', 'fresh', 'AA-EQS inland');
    const eu = find('eu', '15972-60-8', 'surfaceWater', 'fresh', 'AA-EQS inland');
    expect(uk?.value).toBe(eu?.value);
  });

  it('joins a specific pollutant that prints no CAS to a CAS number by name only when the name is unique', () => {
    const nocas = rowsOf('uk').filter((r) => r.cas === null);
    expect(nocas.length).toBeGreaterThan(0);
    for (const r of nocas) expect(r.idBy, r.id).not.toBe('cas');
  });
});

describe('Australia and New Zealand (ANZG 2018)', () => {
  it('keeps each protection level as its own row, with reliability and the year of origin', () => {
    const tce = rowsOf('anzg').filter((r) => r.chemicalId === '71-55-6' && r.waterType === 'fresh');
    expect(tce.map((r) => r.basis).sort()).toEqual([
      '80 percent species protection',
      '90 percent species protection',
      '95 percent species protection',
      '99 percent species protection',
    ]);
    expect(tce.find((r) => r.basis.startsWith('95'))).toMatchObject({
      value: 270,
      unit: 'ug/L',
      year: 2000,
      reliability: 'Unknown',
    });
  });

  it('converts ng/L to ug/L without float noise, and keeps the printed unit', () => {
    const dioxin = rowsOf('anzg').find(
      (r) => /dioxin/i.test(r.name) && r.basis.startsWith('99') && r.waterType === 'fresh',
    );
    expect(dioxin?.value).toBe(2e-7);
    expect(dioxin?.unit).toBe('ug/L');
    expect(dioxin?.printedUnit).toBe('ng/L');
  });
});

describe('MacDonald et al. 2000 consensus guidelines', () => {
  it('holds 29 TEC and 28 PEC, freshwater sediment only', () => {
    const rows = rowsOf('macdonald2000');
    expect(rows.filter((r) => r.basis === 'TEC')).toHaveLength(29);
    expect(rows.filter((r) => r.basis === 'PEC')).toHaveLength(28);
    expect(rows.every((r) => r.medium === 'sediment' && r.waterType === 'fresh')).toBe(true);
  });

  it('keeps the printed units, converted only to the kinds the engine knows', () => {
    const as = find('macdonald2000', '7440-38-2', 'sediment', 'fresh', 'TEC');
    expect(as).toMatchObject({ value: 9.79, unit: 'mg/kg' });
    const bap = rowsOf('macdonald2000').find(
      (r) => r.name === 'Benzo(a)pyrene' && r.basis === 'PEC',
    );
    expect(bap).toMatchObject({ unit: 'ug/kg' });
  });

  it('joins to the Region 4 ids by name, from the committed Region 4 file, never from memory', () => {
    const id = (name: string) => rowsOf('macdonald2000').find((r) => r.name === name)?.chemicalId;
    expect(id('Arsenic')).toBe('7440-38-2');
    expect(id('Chromium')).toBe('7440-47-3');
    expect(id('Lindane (gamma-BHC)')).toBe('58-89-9');
    expect(id('Total DDTs')).toBe('code-ddtr');
    expect(id('Sum DDD')).toBe('code-ddd');
    expect(id('Total PAHs')).toBe('total-pahs');
    for (const r of rowsOf('macdonald2000')) expect(r.idBy, r.id).not.toBe('cas');
  });

  it('has a TEC below the PEC of the same chemical', () => {
    const rows = rowsOf('macdonald2000');
    for (const t of rows.filter((r) => r.basis === 'TEC')) {
      const p = rows.find((r) => r.basis === 'PEC' && r.chemicalId === t.chemicalId);
      if (p !== undefined) expect(t.value as number, t.name).toBeLessThan(p.value as number);
    }
  });
});

describe('generated files', () => {
  const partsOf = () => (Object.values(built.sets) as CriteriaSetFile[]).flatMap(generatedParts);

  it('match the build byte for byte', () => {
    for (const part of partsOf()) {
      const onDisk = readFileSync(
        join(generatedDir, `criteria-${built.edition}`, `${part.name}.json`),
        'utf8',
      );
      expect(onDisk, part.name).toBe(serializeSet(part.file));
    }
  });

  it('keep every file under 450 kB, so the web bundle test (no chunk over 500 kB) holds', () => {
    for (const part of partsOf()) {
      expect(JSON.stringify(part.file).length, part.name).toBeLessThan(450_000);
    }
  });

  it('split ANZG by water type without losing or changing a row', () => {
    const anzg = partsOf().filter((p) => p.file.set === 'anzg');
    expect(anzg.map((p) => p.name)).toEqual(['anzg-fresh', 'anzg-salt']);
    const rows = anzg.flatMap((p) =>
      p.file.rows.map((r) => ({
        ...r,
        note: r.note === undefined ? undefined : p.file.notes[r.note],
      })),
    );
    expect(rows).toHaveLength(built.sets.anzg.rows.length);
    const whole = new Map(
      built.sets.anzg.rows.map((r) => [
        r.id,
        { ...r, note: r.note === undefined ? undefined : built.sets.anzg.notes[r.note] },
      ]),
    );
    for (const r of rows) expect(r).toEqual(whole.get(r.id));
  });
});

describe('identical rows printed under two entries', () => {
  it('keeps one eu2026 fluoranthene MAC row per water type, its note naming entries 15 and 28', () => {
    for (const [wt, basis] of [
      ['fresh', 'MAC-EQS inland'],
      ['salt', 'MAC-EQS other surface waters'],
    ] as const) {
      const rows = rowsOf('eu2026').filter(
        (r) => r.chemicalId === '206-44-0' && r.waterType === wt && r.basis === basis,
      );
      expect(rows.length, wt).toBe(1);
      expect(rows[0]!.id).not.toContain('#');
      const note = built.sets.eu2026.notes[rows[0]!.note!]!;
      expect(note).toMatch(/^entries 15 and 28; /);
      expect(note).not.toContain('entry 15;');
    }
    // The AA-EQS rows are printed once (entry 15) and keep their note.
    const aa = find('eu2026', '206-44-0', 'surfaceWater', 'fresh', 'AA-EQS inland')!;
    expect(built.sets.eu2026.notes[aa.note!]).toMatch(/^entry 15; /);
  });

  it('leaves no unused note, and merges rows of no other set (the others differ in value or carry one entry)', () => {
    for (const set of Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[]) {
      const file = built.sets[set];
      const used = new Set(file.rows.map((r) => r.note).filter((n) => n !== undefined));
      expect(used.size, set).toBe(file.notes.length);
      // every remaining "#k" id is a different value (ANZG arsenic and chromium, carried-forward rows)
      const by = new Map<string, CriteriaRow[]>();
      for (const r of file.rows) {
        const k = r.id.replace(/#\d+$/, '');
        by.set(k, [...(by.get(k) ?? []), r]);
      }
      for (const [k, rs] of by) {
        if (rs.length < 2) continue;
        expect(new Set(rs.map((r) => `${r.value}|${r.unit}`)).size, k).toBe(rs.length);
      }
    }
  });
});

describe('chemicals the text points to a group row', () => {
  it('lists eu2026 PFOS (entry 35) as covered by the PFAS sum (entry 65), and no other set', () => {
    expect(Object.keys(GROUP_POINTERS)).toEqual(['eu2026']);
    const covered = built.sets.eu2026.coveredBy!;
    expect(covered).toHaveLength(1);
    expect(covered[0]).toMatchObject({
      chemicalId: '1763-23-1',
      cas: '1763-23-1',
      entry: 35,
      group: { entry: 65 },
    });
    for (const set of Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[]) {
      if (set !== 'eu2026') expect(built.sets[set].coveredBy, set).toBeUndefined();
    }
  });

  it('points only at a group that has rows in the set, and the covered chemical has none of its own', () => {
    for (const p of built.sets.eu2026.coveredBy!) {
      const group = rowsOf('eu2026').filter((r) => r.chemicalId === p.group.chemicalId);
      expect(group.length).toBeGreaterThan(0);
      expect(group.every((r) => r.name === p.group.name)).toBe(true);
      expect(rowsOf('eu2026').some((r) => r.chemicalId === p.chemicalId)).toBe(false);
    }
  });
});

describe('rows the build merges', () => {
  const base = {
    id: 'eu2026:x:surfaceWater:fresh:aa',
    set: 'eu2026',
    chemicalId: 'x',
    idBy: 'cas',
    name: 'X',
    medium: 'surfaceWater',
    waterType: 'fresh',
    basis: 'AA',
    basisLabel: 'AA',
    endpoint: 'e',
    value: 1,
    unit: 'ug/L',
    printedValue: '1',
    printedUnit: 'ug/l',
    table: 'T1',
    reliability: 'high',
    year: 2026,
  } as unknown as CriteriaRow;

  it('accepts a pair that differs only in id and note', () => {
    expect(() =>
      assertTwinRows(base, { ...base, id: 'other', note: 3 } as CriteriaRow, 'w'),
    ).not.toThrow();
  });

  it.each([
    ['reliability', { reliability: 'low' }],
    ['year', { year: 2020 }],
    ['table', { table: 'T2' }],
    ['printedValue', { printedValue: '1.0' }],
    ['siteSpecific', { siteSpecific: true }],
  ])('throws when the second row differs in %s', (field, change) => {
    expect(() => assertTwinRows(base, { ...base, ...change } as CriteriaRow, 'w')).toThrow(
      new RegExp(`differs in ${field}`),
    );
  });

  it('merges two entry notes with plural wording', () => {
    expect(
      mergeNotes(
        'entry 15; a EQS is printed for this entry and applied',
        'entry 28; a EQS is printed for this entry and applied',
        'T',
      ),
    ).toBe('entries 15 and 28; a EQS is printed for these entries and applied');
  });

  it('falls back to "printed again" when a note is not an entry note', () => {
    expect(mergeNotes('plain', 'other', 'T9')).toBe('plain; printed again: other');
    expect(mergeNotes('plain', '', 'T9')).toBe('plain; also printed again in T9');
    expect(mergeNotes('', '', 'T9')).toBe('also printed again in T9');
  });

  it('keeps both texts when the entry notes differ after the number', () => {
    expect(mergeNotes('entry 15; one', 'entry 28; two', 'T')).toBe(
      'entries 15 and 28; one; printed again (entry 28): two',
    );
    expect(mergeNotes('entries 15 and 28; one', 'entry 30; one', 'T')).toBe(
      'entries 15, 28, 30; one',
    );
  });
});

describe('values printed on an element basis', () => {
  const marked = (): string[] =>
    (Object.keys(built.sets) as (keyof CriteriaBuild['sets'])[])
      .flatMap((set) => rowsOf(set).filter((r) => r.elementBasis !== undefined))
      .map((r) => `${r.id} | ${r.elementBasis}`)
      .sort();

  it('marks the basis in a field of the row, not only in the note', () => {
    expect(find('ccme', '14797-65-0', 'surfaceWater', 'fresh', 'long-term')?.elementBasis).toBe(
      'nitrogen (NO2-N)',
    );
    expect(
      rowsOf('uk').find((r) => r.name === 'Unionised ammonia (as nitrogen)')?.elementBasis,
    ).toBe('nitrogen');
    const anzg = rowsOf('anzg').filter((r) => r.chemicalId === '7664-41-7');
    expect(anzg).toHaveLength(8);
    for (const r of anzg) expect(r.elementBasis, r.id).toBe('nitrogen (NH3-N)');
  });

  it('marks exactly these rows and no others (every set scanned)', () => {
    const ids = marked().map((x) => x.split(' | ')[0]!);
    expect(ids).toHaveLength(10);
    expect(ids.filter((i) => i.startsWith('anzg:7664-41-7:'))).toHaveLength(8);
    expect(ids).toContain('ccme:14797-65-0:surfaceWater:fresh:long-term');
    expect(ids.filter((i) => i.startsWith('uk:'))).toHaveLength(1);
  });

  it('leaves the nitrate, un-ionized ammonia and phosphorus rows unmarked (the source states no element)', () => {
    expect(find('ccme', '14797-55-8', 'surfaceWater', 'fresh', 'long-term')?.elementBasis).toBe(
      undefined,
    );
    expect(find('ccme', '7664-41-7', 'surfaceWater', 'fresh', 'long-term')?.elementBasis).toBe(
      undefined,
    );
    expect(rowsOf('anzg').filter((r) => r.chemicalId === '14797-55-8' && r.elementBasis)).toEqual(
      [],
    );
  });
});
