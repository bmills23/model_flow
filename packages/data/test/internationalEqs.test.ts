import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/sediment/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (set: string, file: string): string => resolve(here, '../raw', set, file);
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

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
const MEDIA = new Set(['freshwater', 'marine', 'sediment-freshwater', 'sediment-marine']);

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

const manifestOf = (set: string) =>
  JSON.parse(readFileSync(raw(set, 'manifest.json'), 'utf8')) as {
    retrieved: string;
    files: { file: string; sha256: string; bytes: number; url?: string }[];
    terms: { url: string; statement: string };
  };

describe.each(['eu-eqs', 'uk-eqs'])('%s manifest and CSV shape', (set) => {
  const m = manifestOf(set);
  it('records the retrieval date, terms with a URL, and matching checksums', () => {
    expect(m.retrieved).toBe('2026-10-23');
    expect(m.terms.url).toMatch(/^https?:\/\//);
    expect(m.terms.statement.length).toBeGreaterThan(20);
    for (const f of m.files) {
      expect(sha(raw(set, f.file)), f.file).toBe(f.sha256);
      expect(readFileSync(raw(set, f.file)).length, f.file).toBe(f.bytes);
    }
    expect(m.files.some((f) => f.url?.startsWith('http'))).toBe(true);
  });
  it('has the agreed header, known media and a numeric value on every row', () => {
    const text = readFileSync(raw(set, 'eqs.csv'), 'utf8');
    expect(text.split('\n')[0]).toBe(HEADER.join(','));
    for (const r of load(set)) {
      expect(MEDIA.has(r.medium), r.name).toBe(true);
      expect(Number.isFinite(r.value) && r.value > 0, `${r.name} ${r.basis}`).toBe(true);
      expect(r.unit).toMatch(/^[μµ]g\/l$/);
      expect(r.basis.length).toBeGreaterThan(0);
      expect(r.where.length).toBeGreaterThan(0);
    }
  });
});

describe('eu-eqs', () => {
  const rows = load('eu-eqs');
  const source = readFileSync(raw('eu-eqs', 'consolidated-02008L0105-20130913.xhtml'), 'utf8')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  it('has the counted rows', () => {
    expect(rows).toHaveLength(180);
    expect(rows.filter((r) => r.medium === 'freshwater')).toHaveLength(92);
    expect(new Set(rows.map((r) => r.name)).size).toBe(53);
    expect(source).toContain('Consolidated TEXT: 32008L0105');
    expect(source).toContain('13.09.2013');
  });

  it('carries values read from the printed annex (inland = freshwater, other = marine)', () => {
    const v = (n: RegExp, medium: string, basis: string) => find(rows, n, medium, basis)?.value;
    expect(v(/^Benzene$/, 'freshwater', 'AA-EQS inland')).toBe(10);
    expect(v(/^Benzene$/, 'marine', 'AA-EQS other surface waters')).toBe(8);
    expect(v(/^Benzene$/, 'freshwater', 'MAC-EQS inland')).toBe(50);
    expect(v(/^Atrazine$/, 'freshwater', 'MAC-EQS inland')).toBe(2);
    expect(v(/^Lead/, 'freshwater', 'AA-EQS inland')).toBe(1.2);
    expect(v(/^Lead/, 'marine', 'AA-EQS other surface waters')).toBe(1.3);
    expect(v(/^Nickel/, 'marine', 'AA-EQS other surface waters')).toBe(8.6);
    expect(v(/^Benzo\(a\)pyrene$/, 'freshwater', 'AA-EQS inland')).toBeCloseTo(1.7e-4, 12);
    expect(v(/^Benzo\(a\)pyrene$/, 'freshwater', 'MAC-EQS inland')).toBe(0.27);
    expect(v(/PFOS/, 'marine', 'AA-EQS other surface waters')).toBeCloseTo(1.3e-4, 12);
    expect(v(/PFOS/, 'freshwater', 'MAC-EQS inland')).toBe(36);
    expect(v(/^Cadmium/, 'marine', 'AA-EQS other surface waters')).toBe(0.2);
    expect(v(/^Cadmium/, 'freshwater', 'AA-EQS inland, hardness class 5')).toBe(0.25);
    expect(v(/^Cadmium/, 'freshwater', 'MAC-EQS inland, hardness class 4')).toBe(0.9);
  });

  it('every sampled value is printed in the committed source with the decimal comma', () => {
    for (const printed of [
      '1912-24-9 0,6 0,6 2,0 2,0',
      '71-43-2 10 8 50 50',
      '7439-92-1 1,2 ( 13 ) 1,3 14 14',
      '7440-02-0 4 ( 13 ) 8,6 34 34',
      '0,25 (Class 5)',
    ]) {
      expect(source, printed).toContain(printed);
    }
  });

  it('keeps the hardness classes and the unpublished water cells honest', () => {
    const cd = rows.filter((r) => /^Cadmium/.test(r.name));
    expect(cd).toHaveLength(16);
    expect(
      cd
        .filter((r) => /hardness class/.test(r.basis))
        .every((r) => /hardness class \d \(/.test(r.note)),
    ).toBe(true);
    // Mercury, hexachlorobenzene, hexachlorobutadiene and the PBDEs print no AA-EQS for water.
    for (const n of [/^Mercury/, /^Hexachloro-benzene/, /^Hexachloro-butadiene/, /^Brominated/]) {
      expect(find(rows, n, 'freshwater', 'AA-EQS inland'), String(n)).toBeUndefined();
    }
    expect(rows.some((r) => /^Dioxins/.test(r.name))).toBe(false);
  });
});

describe('uk-eqs', () => {
  const rows = load('uk-eqs');
  const p2 = rows.filter((r) => r.where.startsWith('Sch 3 Pt 2'));
  const p3 = rows.filter((r) => r.where.startsWith('Sch 3 Pt 3'));
  const eu = load('eu-eqs');

  it('has the counted rows', () => {
    expect(rows).toHaveLength(263);
    expect(p2).toHaveLength(88);
    expect(p3).toHaveLength(175);
    expect(new Set(p2.map((r) => r.name)).size).toBe(29);
    const abc = parseCsv(readFileSync(raw('uk-eqs', 'zinc-abc.csv'), 'utf8'));
    expect(abc).toHaveLength(33);
    expect(abc.find((r) => r['catchment'] === 'Thames')?.['abc_ug_per_l']).toBe('2.0');
    expect(abc.find((r) => r['catchment']!.startsWith('All other'))?.['abc_ug_per_l']).toBe('1.4');
  });

  it('carries specific pollutant values read from Schedule 3 Part 2 Table 1', () => {
    const v = (n: RegExp, medium: string, basis: string) => find(p2, n, medium, basis)?.value;
    expect(v(/^Arsenic/, 'freshwater', 'long-term (mean)')).toBe(50);
    expect(v(/^Arsenic/, 'marine', 'long-term (mean)')).toBe(25);
    expect(v(/^Unionised ammonia/, 'marine', 'long-term (mean)')).toBe(21);
    expect(v(/^Toluene/, 'marine', 'short-term (95 percentile)')).toBe(370);
    expect(v(/^Toluene/, 'freshwater', 'short-term (95 percentile)')).toBe(380);
    expect(v(/^Chlorine/, 'marine', 'short-term (95 percentile)')).toBe(10);
    expect(v(/^Chlorine/, 'marine', 'long-term (mean)')).toBeUndefined();
    expect(v(/^Iron/, 'marine', 'long-term (mean)')).toBe(1000);
    expect(v(/^Tetrachloroethane/, 'freshwater', 'short-term (95 percentile)')).toBe(1848);
    expect(v(/^Glyphosate/, 'freshwater', 'long-term (mean)')).toBe(196);
  });

  it('keeps the site-specific rows with their equations and conditions', () => {
    expect(find(p2, /^Copper/, 'freshwater', 'long-term (mean)')?.note).toContain('bioavailable');
    const cuMarine = find(p2, /^Copper/, 'marine', 'long-term (mean)');
    expect(cuMarine?.value).toBe(3.76);
    expect(cuMarine?.note).toContain('3.76 + (2.677 x ((DOC/2) – 0.5))');
    expect(find(p2, /^Zinc/, 'freshwater', 'long-term (mean)')?.value).toBe(10.9);
    expect(find(p2, /^Zinc/, 'marine', 'long-term (mean)')?.note).toContain('1.1');
    expect(find(p2, /^Manganese/, 'freshwater', 'long-term (mean)')?.value).toBe(123);
    expect(find(p2, /^Cypermethrin/, 'marine', 'short-term (95 percentile)')?.note).toContain(
      'must not be used',
    );
  });

  it('Part 3 agrees with the European annex it transposes, value for value', () => {
    const key = (r: Row) => `${r.cas}|${r.medium}|${r.basis}|${r.value}`;
    const euKeys = new Set(eu.map(key));
    for (const r of p3) expect(euKeys.has(key(r)), `${r.name} ${r.basis}`).toBe(true);
    // The only European values the English text does not carry: the cadmium MAC cells for other waters.
    const ukKeys = new Set(p3.map(key));
    const missing = eu.filter((r) => !ukKeys.has(key(r)));
    expect(missing).toHaveLength(5);
    expect(
      missing.every((r) => /^Cadmium/.test(r.name) && r.basis.startsWith('MAC-EQS other')),
    ).toBe(true);
  });
});
