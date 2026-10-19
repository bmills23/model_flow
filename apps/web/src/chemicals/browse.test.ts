import { describe, expect, it } from 'vitest';
import chemicalsJson from '@model-flow/data/generated/rsl-2024-11/chemicals.json';
import toxJson from '@model-flow/data/generated/rsl-2024-11/tox.json';
import type { ChemicalsFile, ToxFile } from '@model-flow/data/rsl-types';
import { exportCsv } from '../export/csv';
import { browseCsvColumns, browseCsvRows, buildBrowse, filterBrowse } from './browse';

const full = chemicalsJson as unknown as ChemicalsFile;
const tox = toxJson as unknown as ToxFile;
const db = buildBrowse(full, tox);

function rec(cas: string) {
  const r = db.records.find((x) => x.cas === cas);
  if (!r) throw new Error(`no record for ${cas}`);
  return r;
}

describe('buildBrowse', () => {
  it('has one record per toxicity entry and carries the data edition', () => {
    expect(db.records).toHaveLength(tox.toxicity.length);
    expect(db.edition).toBe(tox.edition);
  });

  it('shows every physical value and its reference exactly as the data file has them', () => {
    for (const r of db.records) {
      const src = full.chemicals.find((c) => c.id === r.id)!;
      const shown = r.rows.filter((x) => x.group === 'Physical-chemical' && x.key !== 'fa');
      const have = Object.entries(src.values);
      expect(shown).toHaveLength(have.length);
      for (const [key, v] of have) {
        const row = shown.find((x) => x.key === key)!;
        expect(row.value).toBe(v.value);
        expect(row.text).toBe(String(v.value));
        expect(row.source).toBe(v.ref ?? 'not stated');
        const unit = full.units[key as keyof typeof full.units];
        expect(row.unit).toBe(unit === '1' ? 'dimensionless' : unit);
      }
    }
  });

  it('shows every toxicity value with the name of its source', () => {
    const benzene = rec('71-43-2');
    const src = tox.toxicity.find((t) => t.id === benzene.id)!;
    for (const key of ['sfo', 'iur', 'rfdo', 'rfci'] as const) {
      const row = benzene.rows.find((x) => x.key === key);
      if (src[key] === undefined) {
        expect(row).toBeUndefined();
      } else {
        expect(row!.value).toBe(src[key]!.value);
        expect(row!.source).toBe(tox.sourceKeys[src[key]!.source]);
        expect(row!.group).toBe('Toxicity');
      }
    }
  });

  it('shows the volatile and mutagen flags as Yes or No', () => {
    const r = rec('71-43-2');
    const src = tox.toxicity.find((t) => t.id === r.id)!;
    expect(r.rows.find((x) => x.key === 'volatile')!.text).toBe(src.volatile ? 'Yes' : 'No');
    expect(r.rows.find((x) => x.key === 'mutagen')!.text).toBe(src.mutagen ? 'Yes' : 'No');
  });
});

describe('filterBrowse', () => {
  it('returns every record for an empty query', () => {
    expect(filterBrowse(db, '  ')).toHaveLength(db.records.length);
  });
  it('matches a name fragment without regard to case', () => {
    const hits = filterBrowse(db, 'BENZENE');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((h) => h.name.toLowerCase().includes('benzene'))).toBe(true);
  });
  it('matches a CAS number', () => {
    const hits = filterBrowse(db, '71-43-2');
    expect(hits.map((h) => h.cas)).toContain('71-43-2');
  });
  it('returns nothing for a query that matches nothing', () => {
    expect(filterBrowse(db, 'zzzz-not-a-chemical')).toEqual([]);
  });
});

describe('browse CSV', () => {
  it('writes one row per value with a source column', () => {
    const rows = browseCsvRows([rec('71-43-2')]);
    const csv = exportCsv(rows, browseCsvColumns);
    const [header, first] = csv.split('\r\n');
    expect(header).toBe('Chemical,CAS,Group,Property,Value,Unit,Source');
    expect(first).toContain('Benzene');
    expect(rows.every((r) => typeof r.source === 'string' && r.source !== '')).toBe(true);
  });
  it('covers all rows of all given records', () => {
    const some = filterBrowse(db, 'toluene');
    const n = some.reduce((a, r) => a + r.rows.length, 0);
    expect(browseCsvRows(some)).toHaveLength(n);
  });
});
