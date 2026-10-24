import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { casCheckDigitValid } from '../src/nrwqc/parse.js';
import { parseCsv } from '../src/sediment/csv.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../raw/ccme');
const text = readFileSync(resolve(dir, 'ccme.csv'), 'utf8');
const rows = parseCsv(text);
const pick = (cas: string, medium: string, basis: string) =>
  rows.find((r) => r.cas === cas && r.medium === medium && r.basis === basis);

describe('CCME aquatic life guidelines (raw/ccme/ccme.csv)', () => {
  it('has the agreed header and row counts', () => {
    expect(text.split('\n')[0]).toBe(
      'cas,name_printed,medium,basis,value,unit_printed,table_or_page,note',
    );
    expect(rows).toHaveLength(315);
    const count = (m: string, b: string) =>
      rows.filter((r) => r.medium === m && r.basis === b).length;
    expect(count('freshwater', 'long-term')).toBe(127);
    expect(count('freshwater', 'short-term')).toBe(12);
    expect(count('marine', 'long-term')).toBe(38);
    expect(count('marine', 'short-term')).toBe(4);
    expect(count('sediment-freshwater', 'ISQG')).toBe(34);
    expect(count('sediment-freshwater', 'PEL')).toBe(33);
    expect(count('sediment-marine', 'ISQG')).toBe(34);
    expect(count('sediment-marine', 'PEL')).toBe(33);
    expect(rows.filter((r) => r.value !== '')).toHaveLength(276);
  });

  it('uses only the four media and units by medium', () => {
    for (const r of rows) {
      expect(['freshwater', 'marine', 'sediment-freshwater', 'sediment-marine']).toContain(
        r.medium,
      );
      if (r.value === '') expect(r.unit_printed).toBe('');
      else if (r.medium?.startsWith('sediment')) {
        expect(['µg/kg dry weight', 'ng TEQ/kg dry weight']).toContain(r.unit_printed);
      } else expect(['µg/L', 'μg/L']).toContain(r.unit_printed);
      if (r.value !== '') expect(Number.isFinite(Number(r.value))).toBe(true);
    }
  });

  it('carries valid CAS numbers where one is printed, flagging the one the source misprints', () => {
    for (const r of rows) {
      if (r.cas === '') continue;
      if (r.cas === '13826-41-3') {
        expect(r.note).toContain('fails its check digit');
      } else expect(casCheckDigitValid(r.cas ?? ''), `${r.name_printed ?? ''}`).toBe(true);
    }
  });

  it('holds a handful of values as the fetched table prints them', () => {
    expect(pick('71-43-2', 'freshwater', 'long-term')?.value).toBe('370');
    expect(pick('71-43-2', 'marine', 'long-term')?.value).toBe('110');
    expect(pick('50-32-8', 'freshwater', 'long-term')?.value).toBe('0.015');
    expect(pick('50-32-8', 'sediment-freshwater', 'ISQG')?.value).toBe('31.9');
    expect(pick('50-32-8', 'sediment-marine', 'PEL')?.value).toBe('763');
    expect(pick('7440-43-9', 'sediment-freshwater', 'PEL')?.value).toBe('3500');
    expect(pick('7440-43-9', 'marine', 'long-term')?.value).toBe('0.12');
    expect(pick('7440-66-6', 'sediment-marine', 'PEL')?.value).toBe('271000');
    expect(pick('16887-00-6', 'freshwater', 'short-term')?.value).toBe('640000');
  });

  it('keeps hardness and site-chemistry equations as valueless rows with the printed word', () => {
    const cd = pick('7440-43-9', 'freshwater', 'long-term');
    expect(cd?.value).toBe('');
    expect(cd?.note).toContain('printed as: Equation');
    expect(pick('7440-50-8', 'freshwater', 'long-term')?.value).toBe('');
  });

  it('ships the two cells that were left valueless, each with its printed text and basis in the note', () => {
    // Metribuzin prints "1,0": one digit after the comma is not a thousands group, and every other cell
    // of the table writes its decimals with a point, so the comma is a decimal separator.
    const met = pick('21087-64-9', 'freshwater', 'long-term');
    expect(met?.value).toBe('1.0');
    expect(met?.unit_printed).toBe('µg/L');
    expect(met?.note).toContain('printed as: 1,0');
    expect(met?.note).toContain('decimal');
    // Nitrite prints "60 NO2-N": the figure is stated as nitrogen.
    const nit = pick('14797-65-0', 'freshwater', 'long-term');
    expect(nit?.value).toBe('60');
    expect(nit?.unit_printed).toBe('µg/L');
    expect(nit?.note).toContain('printed as: 60 NO2-N');
    expect(nit?.note).toContain('as nitrogen');
  });

  it('decodes a CAS number the source prints as a date', () => {
    expect(pick('85-01-8', 'sediment-marine', 'ISQG')?.value).toBe('86.7');
    expect(pick('85-01-8', 'sediment-marine', 'ISQG')?.note).toContain('1985-01-08');
  });

  it('has a manifest with the source hash and no committed raw file', () => {
    const m = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as {
      retrieved: string;
      files: { file: string; sha256?: string }[];
    };
    expect(m.retrieved).toBe('2026-10-23');
    expect(m.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
