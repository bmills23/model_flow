import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/sediment/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (set: string, file: string): string => resolve(here, '../raw', set, file);
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const SET = 'eu-eqs-2026';
const SOURCE = 'consolidated-02008L0105-20260510.xhtml';
const HEADER = [
  'cas',
  'name_printed',
  'medium',
  'basis',
  'value',
  'unit_printed',
  'table_or_page',
  'note',
];

interface Row {
  cas: string;
  name: string;
  medium: string;
  basis: string;
  value: number;
  unit: string;
  where: string;
  note: string;
}
const load = (set: string): Row[] =>
  parseCsv(readFileSync(raw(set, 'eqs.csv'), 'utf8')).map((r) => ({
    cas: r['cas']!,
    name: r['name_printed']!,
    medium: r['medium']!,
    basis: r['basis']!,
    value: Number(r['value']),
    unit: r['unit_printed']!,
    where: r['table_or_page']!,
    note: r['note']!,
  }));
const find = (rows: Row[], name: RegExp, medium: string, basis: string): Row | undefined =>
  rows.find((r) => name.test(r.name) && r.medium === medium && r.basis === basis);

/** The same substance in both sets: the printed name without case, hyphens, spaces or punctuation. */
const identity = (r: Row): string => r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
const ids = (rows: Row[]): Set<string> => new Set(rows.map(identity));
const nameOf = (rows: Row[], id: string): string => rows.find((r) => identity(r) === id)!.name;

const rows = load(SET);
const old = load('eu-eqs');
const partA = rows.filter((r) => r.where === 'Annex I Part A table');
const partC = rows.filter((r) => r.where === 'Annex II Part C table');
const text = readFileSync(raw(SET, SOURCE), 'utf8')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/\s+/g, ' ');

describe('eu-eqs-2026 manifest and source', () => {
  const m = JSON.parse(readFileSync(raw(SET, 'manifest.json'), 'utf8')) as {
    set: string;
    retrieved: string;
    files: { file: string; role: string; sha256: string; bytes: number; url?: string }[];
    actFetched: { url: string; sha256: string; bytes: number; committed: boolean };
    terms: { url: string; statement: string };
    counts: { rows: number };
  };

  it('records the retrieval date, terms with a URL, and matching checksums', () => {
    expect(m.set).toBe(SET);
    expect(m.retrieved).toBe('2026-10-23');
    expect(m.terms.url).toMatch(/^https?:\/\//);
    expect(m.terms.statement).toContain('2011/833/EU');
    expect(m.files.map((f) => f.file).sort()).toEqual([SOURCE, 'eqs.csv']);
    for (const f of m.files) {
      expect(sha(raw(SET, f.file)), f.file).toBe(f.sha256);
      expect(readFileSync(raw(SET, f.file)).length, f.file).toBe(f.bytes);
    }
    expect(m.files.find((f) => f.role === 'source')?.url).toBe(
      'http://publications.europa.eu/resource/celex/02008L0105-20260510',
    );
    expect(m.actFetched.url).toBe('http://publications.europa.eu/resource/celex/32026L0805');
    expect(m.actFetched.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.actFetched.committed).toBe(false);
    expect(m.counts.rows).toBe(rows.length);
  });

  it('is the consolidated text after Directive (EU) 2026/805', () => {
    expect(text).toContain('Consolidated TEXT: 32008L0105');
    expect(text).toContain('02008L0105 \u2014 EN \u2014 10.05.2026 \u2014 002.001');
    expect(text).toContain('DIRECTIVE (EU) 2026/805 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL');
    expect(text).toContain('of 30 March 2026 L 805 1 20.4.2026');
  });

  it('has the agreed header, known media and a numeric positive value on every row', () => {
    expect(readFileSync(raw(SET, 'eqs.csv'), 'utf8').split('\n')[0]).toBe(HEADER.join(','));
    for (const r of rows) {
      expect(['freshwater', 'marine'].includes(r.medium), r.name).toBe(true);
      expect(Number.isFinite(r.value) && r.value > 0, `${r.name} ${r.basis}`).toBe(true);
      expect(r.unit).toMatch(/^[μµ]g\/l$/);
      expect(r.basis.length).toBeGreaterThan(0);
    }
  });
});

describe('eu-eqs-2026 rows read from the printed annex', () => {
  const v = (n: RegExp, medium: string, basis: string, set: Row[] = partA) =>
    find(set, n, medium, basis)?.value;

  it('has the counted rows', () => {
    expect(rows).toHaveLength(COUNTS.rows);
    expect(partA).toHaveLength(COUNTS.partA);
    expect(partC).toHaveLength(COUNTS.partC);
    expect(new Set(partA.map((r) => r.name)).size).toBe(COUNTS.partANames);
  });

  it('unchanged substance: benzene keeps its 2013 cells', () => {
    expect(text).toContain('71-43-2 200-753-7 10 8 50 50');
    expect(v(/^Benzene$/, 'freshwater', 'AA-EQS inland')).toBe(10);
    expect(v(/^Benzene$/, 'marine', 'AA-EQS other surface waters')).toBe(8);
    expect(v(/^Benzene$/, 'freshwater', 'MAC-EQS inland')).toBe(50);
    expect(v(/^Benzene$/, 'marine', 'MAC-EQS other surface waters')).toBe(50);
    expect(v(/^Benzene$/, 'freshwater', 'AA-EQS inland', old)).toBe(10);
    expect(find(partA, /^Benzene$/, 'freshwater', 'AA-EQS inland')?.note).not.toContain('2027');
  });

  it('revised substance: nickel (entry 23) with the date of application in the note', () => {
    expect(text).toContain('7440-02-0 231-111-4 2 ( 12 ) 3,1 8,2 8,2');
    expect(v(/^Nickel/, 'freshwater', 'AA-EQS inland')).toBe(2);
    expect(v(/^Nickel/, 'marine', 'AA-EQS other surface waters')).toBe(3.1);
    expect(v(/^Nickel/, 'freshwater', 'MAC-EQS inland')).toBe(8.2);
    expect(v(/^Nickel/, 'marine', 'MAC-EQS other surface waters')).toBe(8.2);
    expect(v(/^Nickel/, 'freshwater', 'AA-EQS inland', old)).toBe(4);
    expect(v(/^Nickel/, 'marine', 'AA-EQS other surface waters', old)).toBe(8.6);
    const note = find(partA, /^Nickel/, 'freshwater', 'AA-EQS inland')!.note;
    expect(note).toContain('entry 23');
    expect(note).toContain('22 December 2027');
    expect(note).toContain('Article 3(1a)(iii)');
    expect(note).toContain('22 December 2033');
    expect(note).toContain('footnote 12: These EQS refer to bioavailable concentrations');
  });

  it('revised substance with a printed power of ten: fluoranthene (entry 15)', () => {
    expect(text).toContain('206-44-0 205-912-4 7,62 × 10 -4 7,62 × 10 -4 0,12 0,012');
    expect(v(/^Fluoranthene$/, 'freshwater', 'AA-EQS inland')).toBeCloseTo(7.62e-4, 12);
    expect(v(/^Fluoranthene$/, 'marine', 'MAC-EQS other surface waters')).toBe(0.012);
    expect(find(partA, /^Fluoranthene$/, 'freshwater', 'AA-EQS inland')?.note).toContain(
      'printed 7,62 × 10 -4',
    );
  });

  it('new substances (entries 46 to 70) carry the later date and good-status year', () => {
    expect(text).toContain('298-46-4 206-062-7 2,5 0,25 1,6 × 10 3 160');
    expect(v(/^Carbamazepine$/, 'freshwater', 'AA-EQS inland')).toBe(2.5);
    expect(v(/^Carbamazepine$/, 'freshwater', 'MAC-EQS inland')).toBe(1600);
    expect(v(/^Carbamazepine$/, 'marine', 'MAC-EQS other surface waters')).toBe(160);
    const note = find(partA, /^Carbamazepine$/, 'freshwater', 'AA-EQS inland')!.note;
    expect(note).toContain('entry 52');
    expect(note).toContain('Article 3(1a)(iv)');
    expect(note).toContain('22 December 2027');
    expect(note).toContain('22 December 2039');
    expect(find(old, /arbamazepine/, 'freshwater', 'AA-EQS inland')).toBeUndefined();
  });

  it('keeps the two glyphosate inland values apart by their footnote', () => {
    expect(text).toContain('1071-83-6 213-997-4 0,1 ( 24 ) 86,7 ( 25 ) 8,67');
    expect(v(/^Glyphosate$/, 'freshwater', 'AA-EQS inland, drinking water abstraction')).toBe(0.1);
    expect(v(/^Glyphosate$/, 'freshwater', 'AA-EQS inland, not drinking water abstraction')).toBe(
      86.7,
    );
    expect(v(/^Glyphosate$/, 'marine', 'AA-EQS other surface waters')).toBe(8.67);
    // MAC inland is "not applicable ( 24 ) 398,6 ( 25 )": only the second value is a number.
    expect(v(/^Glyphosate$/, 'freshwater', 'MAC-EQS inland, not drinking water abstraction')).toBe(
      398.6,
    );
    expect(
      partA.filter((r) => /^Glyphosate$/.test(r.name) && /MAC-EQS inland/.test(r.basis)),
    ).toHaveLength(1);
  });

  it('splits the two silver salinity values of the other-waters cell', () => {
    expect(text).toContain('0,006 (10‰ salinity) 0,17 (30‰ salinity)');
    expect(v(/^Silver$/, 'marine', 'AA-EQS other surface waters, 10‰ salinity')).toBe(0.006);
    expect(v(/^Silver$/, 'marine', 'AA-EQS other surface waters, 30‰ salinity')).toBe(0.17);
    expect(v(/^Silver$/, 'freshwater', 'MAC-EQS inland')).toBe(0.022);
    // MAC other surface waters is printed "not derived".
    expect(partA.some((r) => /^Silver$/.test(r.name) && /MAC-EQS other/.test(r.basis))).toBe(false);
  });

  it('reads the PFAS sum and the pesticide sum as printed', () => {
    expect(v(/^Per- and polyfluoroalkyl/, 'freshwater', 'AA-EQS inland')).toBe(0.0044);
    expect(v(/^Per- and polyfluoroalkyl/, 'marine', 'AA-EQS other surface waters')).toBe(0.0044);
    expect(find(partA, /^Per- and polyfluoroalkyl/, 'freshwater', 'AA-EQS inland')?.note).toContain(
      'printed Sum of PFOA equivalents 0,0044',
    );
    expect(v(/^Sum of active substances/, 'freshwater', 'AA-EQS inland')).toBe(0.2);
    expect(partA.filter((r) => /^Sum of active substances/.test(r.name))).toHaveLength(1);
  });

  it('keeps the cadmium hardness classes and the PAH sub-rows with their own cells', () => {
    const cd = partA.filter((r) => /^Cadmium/.test(r.name));
    expect(cd).toHaveLength(16);
    expect(v(/^Cadmium/, 'freshwater', 'AA-EQS inland, hardness class 5')).toBe(0.25);
    expect(v(/^Cadmium/, 'freshwater', 'MAC-EQS inland, hardness class 4')).toBe(0.9);
    expect(v(/^Cadmium/, 'marine', 'AA-EQS other surface waters')).toBe(0.2);
    expect(text).toContain('50-32-8 200-028-5 0,5 0,05 0,6');
    expect(v(/^Benzo\(a\)pyrene$/, 'freshwater', 'MAC-EQS inland')).toBe(0.5);
    expect(v(/^Benzo\(a\)pyrene$/, 'marine', 'MAC-EQS other surface waters')).toBe(0.05);
    expect(find(partA, /^Benzo\(a\)pyrene$/, 'freshwater', 'AA-EQS inland')).toBeUndefined();
    expect(v(/^Dibenz\(a,h\)anthracene$/, 'freshwater', 'MAC-EQS inland')).toBe(0.014);
    expect(v(/^Indeno/, 'freshwater', 'MAC-EQS inland')).toBeUndefined();
  });

  it('leaves out cells printed not applicable, not derived, see footnote or blank', () => {
    expect(partA.some((r) => /^Mercury/.test(r.name) && /AA-EQS/.test(r.basis))).toBe(false);
    expect(partA.some((r) => /^Dioxins/.test(r.name))).toBe(false);
    expect(partA.some((r) => /^Perfluorooctane sulfonic/.test(r.name))).toBe(false);
    expect(partA.some((r) => /^Dicofol$/.test(r.name) && /MAC-EQS/.test(r.basis))).toBe(false);
    expect(partA.some((r) => /^Ibuprofen$/.test(r.name) && /MAC-EQS/.test(r.basis))).toBe(false);
    expect(partA.some((r) => /^17 alpha/.test(r.name) && /MAC-EQS/.test(r.basis))).toBe(false);
  });
});

describe('eu-eqs-2026 against the 2013 set', () => {
  const oldIds = ids(old);
  const partAIds = ids(partA);
  const partCIds = ids(partC);
  const addedIds = [...partAIds].filter((i) => !oldIds.has(i));
  const removedIds = [...oldIds].filter((i) => !partAIds.has(i) && !partCIds.has(i));
  const movedIds = [...oldIds].filter((i) => !partAIds.has(i) && partCIds.has(i));

  // Fluoranthene is printed twice in 2026 (entry 15 and a PAH sub-row of entry 28) with the same cells.
  const valuesOf = (set: Row[], id: string): string =>
    [
      ...new Set(
        set.filter((r) => identity(r) === id).map((r) => `${r.medium}|${r.basis}|${r.value}`),
      ),
    ]
      .sort()
      .join('\n');
  const changedIds = [...partAIds]
    .filter((i) => oldIds.has(i))
    .filter((i) => valuesOf(partA, i) !== valuesOf(old, i));
  const sameIds = [...partAIds].filter((i) => oldIds.has(i) && !changedIds.includes(i));

  it('lists the substances added to Part A', () => {
    expect(addedIds.map((i) => nameOf(partA, i)).sort()).toEqual(ADDED);
  });

  it('lists the substances whose water cells vanished from the set', () => {
    expect(removedIds.map((i) => nameOf(old, i)).sort()).toEqual(REMOVED);
  });

  it('lists the substances moved from Part A to Annex II Part C with their values unchanged', () => {
    expect(movedIds.map((i) => nameOf(old, i)).sort()).toEqual(MOVED);
    for (const i of movedIds) {
      const strip = (s: string) => s.replace(/\|/g, '/');
      expect(strip(valuesOf(partC, i)), nameOf(old, i)).toBe(strip(valuesOf(old, i)));
    }
    for (const r of partC) expect(r.note).toContain('moved from Annex I Part A');
  });

  it('lists the substances whose water values changed', () => {
    expect(changedIds.map((i) => nameOf(partA, i)).sort()).toEqual(CHANGED);
  });

  it('lists the substances whose water values are unchanged', () => {
    expect(sameIds.map((i) => nameOf(partA, i)).sort()).toEqual(SAME);
  });

  it('puts a date of application in every changed and added row, with two printed exceptions', () => {
    const dated = new Set(partA.filter((r) => r.note.includes('22 December 2027')).map(identity));
    const undated = [...changedIds, ...addedIds].filter((i) => !dated.has(i));
    // Hexachlorobenzene (entry 16) and heptachlor (entry 44) print changed water cells, but neither entry is
    // named in Article 3(1a)(iii), so the text gives their new values no date of application.
    expect(undated.map((i) => nameOf(partA, i)).sort()).toEqual(CHANGED_WITHOUT_DATE);
    for (const i of undated) {
      expect(
        partA.filter((r) => identity(r) === i).every((r) => /^entry (16|44)(;|$)/.test(r.note)),
      ).toBe(true);
    }
    // Entries named by Article 3(1a)(iii) can keep their water cells (the revision is to the biota cell).
    expect(
      [...dated]
        .filter((i) => !changedIds.includes(i) && !addedIds.includes(i))
        .map((i) => nameOf(partA, i))
        .sort(),
    ).toEqual(REVISED_WITH_SAME_WATER_CELLS);
    // The new priority substances all carry the (iv) wording, the revised ones the (iii) wording.
    const newEntries = partA.filter((r) => /^entry (4[6-9]|[5-6]\d|70);/.test(r.note));
    expect(newEntries).toHaveLength(88);
    expect(newEntries.every((r) => r.note.includes('Article 3(1a)(iv)'))).toBe(true);
    expect(
      partA
        .filter((r) => /Article 3\(1a\)\(iii\)/.test(r.note))
        .every((r) => /^entry (5|9|13|15|17|21|23|24|28|30|34|37|41|43);/.test(r.note)),
    ).toBe(true);
  });
});

// Counted from the printed annex and checked by hand against the source text.
const COUNTS = { rows: 272, partA: 252, partC: 20, partANames: 74 };
const ADDED = [
  '17 alpha-ethinylestradiol (EE2)',
  '17 beta-estradiol (E2)',
  'Acetamiprid',
  'Azithromycin',
  'Benzo(a)anthracene',
  'Bifenthrin',
  'Bisphenol-A (BPA)',
  'Carbamazepine',
  'Chrysene',
  'Clarithromycin',
  'Clothianidin',
  'Deltamethrin',
  'Dibenz(a,h)anthracene',
  'Diclofenac',
  'Erythromycin',
  'Esfenvalerate',
  'Estrone (E1)',
  'Glyphosate',
  'Ibuprofen',
  'Imidacloprid',
  'Nicosulfuron',
  'Per- and polyfluoroalkyl substances (PFAS) – sum of 25',
  'Permethrin',
  'Silver',
  'Sum of active substances in the pesticides listed in this table',
  'Thiacloprid',
  'Thiamethoxam',
  'Triclosan',
];
const REMOVED = ['Perfluorooctane sulfonic acid and its derivatives (PFOS)'];
const MOVED = [
  'Alachlor',
  'Atrazine',
  'Carbon-tetrachloride',
  'Chlorfenvinphos',
  'Simazine',
  'Trichloro-benzenes',
];
const CHANGED = [
  'Benzo(a)pyrene',
  'Chlorpyrifos (Chlorpyrifos-ethyl)',
  'Cypermethrin',
  'Dicofol',
  'Diuron',
  'Fluoranthene',
  'Heptachlor and heptachlor epoxide',
  'Hexabromocyclododecane (HBCDD)',
  'Hexachlorobenzene',
  'Hexachlorobutadiene',
  'Nickel and its compounds',
  'Nonylphenols (4-Nonylphenol)',
];
const CHANGED_WITHOUT_DATE = ['Heptachlor and heptachlor epoxide', 'Hexachlorobenzene'];
const REVISED_WITH_SAME_WATER_CELLS = [
  'Benzo(b)fluoranthene',
  'Benzo(g,h,i)perylene',
  'Benzo(k)fluoranthene',
  'Brominated diphenylethers',
  'Mercury and its compounds',
  'Tributyltin compounds (Tributyltin-cation)',
];
const SAME = [
  '1,2-Dichloroethane',
  'Aclonifen',
  'Anthracene',
  'Benzene',
  'Benzo(b)fluoranthene',
  'Benzo(g,h,i)perylene',
  'Benzo(k)fluoranthene',
  'Bifenox',
  'Brominated diphenylethers',
  'C 10-13 Chloroalkanes',
  'Cadmium and its compounds (depending on water hardness classes)',
  'Cybutryne',
  'Cyclodiene pesticides: Aldrin Dieldrin Endrin Isodrin',
  'DDT total',
  'Di(2-ethylhexyl)-phthalate (DEHP)',
  'Dichloromethane',
  'Dichlorvos',
  'Endosulfan',
  'Hexachlorocyclohexane',
  'Isoproturon',
  'Lead and its compounds',
  'Mercury and its compounds',
  'Naphthalene',
  'Octylphenols ((4-(1,1’,3,3’-tetramethylbutyl)-phenol))',
  'Pentachlorobenzene',
  'Pentachlorophenol',
  'Quinoxyfen',
  'Terbutryn',
  'Tetrachloroethylene',
  'Tributyltin compounds (Tributyltin-cation)',
  'Trichloroethylene',
  'Trichloromethane',
  'Trifluralin',
  'para-para-DDT',
];
