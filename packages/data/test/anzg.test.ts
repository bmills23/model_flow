import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { casCheckDigitValid } from '../src/nrwqc/parse.js';
import { parseCsv } from '../src/sediment/csv.js';
import { CSV_HEADER, normaliseCas } from '../scripts/extract-anzg.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../raw/anzg');
const csvText = readFileSync(resolve(dir, 'anzg-2018-dgv.csv'), 'utf8');
const rows = parseCsv(csvText);
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as {
  retrieved: string;
  source: { url: string; sha256: string; committed: boolean };
  terms: { url: string };
  csv: {
    sha256: string;
    rows: number;
    sourceRows: number;
    rowsByProtectionLevel: Record<string, number>;
  };
  rowsWithoutValues: unknown[];
};

// The workbook is not committed (no open licence mark on the master table page), so the values below
// were read from the fetched worksheet cells of 2026-10-23 and are checked here against the CSV.
const find = (name: string, medium: string, basis: string) =>
  rows.find((r) => r.name_printed === name && r.medium === medium && r.basis === basis);

describe('ANZG toxicant DGV set', () => {
  it('has the declared header, row counts and checksum', () => {
    expect(Object.keys(rows[0]!)).toEqual([...CSV_HEADER]);
    expect(rows).toHaveLength(841);
    expect(manifest.csv.rows).toBe(rows.length);
    expect(manifest.csv.sourceRows).toBe(326);
    expect(manifest.rowsWithoutValues).toHaveLength(77);
    expect(createHash('sha256').update(csvText).digest('hex')).toBe(manifest.csv.sha256);
    const levels = Object.values(manifest.csv.rowsByProtectionLevel).reduce((a, b) => a + b, 0);
    expect(levels).toBe(rows.length);
  });

  it('contains no long dash', () => {
    expect(csvText.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it('records the source, retrieval date and terms, and does not commit the workbook', () => {
    expect(manifest.retrieved).toBe('2026-10-23');
    expect(manifest.source.url).toMatch(
      /^https:\/\/www\.waterquality\.gov\.au\/.*mastertable\.xlsx$/,
    );
    expect(manifest.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.source.committed).toBe(false);
    expect(manifest.terms.url).toBe('https://www.waterquality.gov.au/anz-guidelines/copyright');
  });

  it('uses only the printed units and the two media', () => {
    const units = new Set(rows.map((r) => r.unit_printed));
    expect([...units].sort()).toEqual(['mg/L', 'ng/L', 'µg Sn/L', 'µg/L']);
    expect(new Set(rows.map((r) => r.medium))).toEqual(new Set(['freshwater', 'marine']));
    for (const r of rows) {
      expect(Number.isFinite(Number(r.value))).toBe(true);
      expect(Number(r.value)).toBeGreaterThan(0);
      expect(r.table_or_page).toMatch(/row \d+, column [G-K]$/);
    }
  });

  it('matches values read from the worksheet', () => {
    const p99 = '99 percent species protection';
    expect(find('1,1,1-Trichloroethane', 'freshwater', p99)?.value).toBe('130');
    expect(
      find('1,1,1-Trichloroethane', 'freshwater', '95 percent species protection')?.value,
    ).toBe('270');
    expect(
      find('1,1,1-Trichloroethane', 'freshwater', '90 percent species protection')?.value,
    ).toBe('400');
    expect(
      find('1,1,1-Trichloroethane', 'freshwater', '80 percent species protection')?.value,
    ).toBe('650');
    const ammonia = find('Ammonia', 'freshwater', p99)!;
    expect([ammonia.value, ammonia.unit_printed, ammonia.reliability]).toEqual([
      '0.32',
      'mg/L',
      'Very High',
    ]);
    expect(find('Nickel', 'marine', p99)?.value).toBe('1.4');
    expect(find('Dioxins', 'freshwater', p99)).toMatchObject({
      value: '0.0002',
      unit_printed: 'ng/L',
    });
    expect(find('Tributyltin', 'marine', p99)).toMatchObject({
      value: '0.0004',
      unit_printed: 'µg Sn/L',
    });
    expect(find('Aluminium (pH <6.5)', 'freshwater', 'unknown level of protection')?.value).toBe(
      '0.8',
    );
  });

  it('splits the comma-list cells by the label the row prints', () => {
    expect(find('Zinc', 'freshwater', `${'99 percent species protection'}, Australia`)?.value).toBe(
      '1.9',
    );
    expect(
      find('Zinc', 'freshwater', `${'99 percent species protection'}, New Zealand`)?.value,
    ).toBe('1.5');
    expect(
      find('Nitrate', 'freshwater', '99 percent species protection, hard water (> 150 mg/L CaCO3)')
        ?.value,
    ).toBe('18');
    expect(
      rows.filter((r) => r.name_printed === 'Nickel' && r.medium === 'freshwater'),
    ).toHaveLength(8);
  });

  it('keeps carried-forward 2000 values distinct from newer derivations', () => {
    const years = new Set(rows.map((r) => r.publish_year));
    expect([...years].sort()).toEqual(['2000', '2020', '2021', '2023', '2024', '2025', '2026']);
    expect(
      find('1,1,1-Trichloroethane', 'marine', '99 percent species protection')?.note,
    ).toContain('ANZECC and ARMCANZ 2000');
  });

  it('restores date-mangled CAS text and flags a printed number that fails the check', () => {
    const fixed = normaliseCas('0107-06-02');
    expect(fixed.cas).toBe('107-06-2');
    expect(casCheckDigitValid(fixed.cas)).toBe(true);
    expect(find('1,2-Dichloroethane', 'freshwater', '99 percent species protection')?.cas).toBe(
      '107-06-2',
    );
    expect(normaliseCas('-').cas).toBe('');
    expect(normaliseCas(' 1918-02-1').cas).toBe('1918-02-1');
    const vanadium = find('Vanadium', 'marine', '99 percent species protection')!;
    expect(vanadium.cas).toBe('7440-62-3');
    expect(vanadium.note).toContain('fails the CAS check');
  });
});
