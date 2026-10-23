import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/sediment/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../raw/macdonald2000');
const rows = parseCsv(readFileSync(resolve(dir, 'consensus-tec-pec.csv'), 'utf8'));
const get = (name: string, basis: string) =>
  rows.find((r) => r.name_printed === name && r.basis === basis);

describe('MacDonald et al. 2000 consensus TEC and PEC transcription', () => {
  it('has the documented header and no CAS numbers the article does not print', () => {
    expect(Object.keys(rows[0]!)).toEqual([
      'cas',
      'name_printed',
      'medium',
      'basis',
      'value',
      'unit_printed',
      'table_or_page',
      'note',
    ]);
    expect(rows.every((r) => r.cas === '')).toBe(true);
  });

  it('has 29 TEC rows and 28 PEC rows, all freshwater sediment', () => {
    expect(rows.filter((r) => r.basis === 'TEC')).toHaveLength(29);
    expect(rows.filter((r) => r.basis === 'PEC')).toHaveLength(28);
    expect(rows.every((r) => r.medium === 'sediment-freshwater')).toBe(true);
    // Dibenz[a,h]anthracene has a printed TEC and no PEC.
    expect(get('Dibenz[a,h]anthracene', 'PEC')).toBeUndefined();
  });

  it('keeps units as printed: mg/kg for the eight metals, ug/kg for the rest', () => {
    const metals = [
      'Arsenic',
      'Cadmium',
      'Chromium',
      'Copper',
      'Lead',
      'Mercury',
      'Nickel',
      'Zinc',
    ];
    for (const r of rows) {
      expect(r.unit_printed).toBe(metals.includes(r.name_printed!) ? 'mg/kg DW' : 'µg/kg DW');
    }
  });

  it('matches values read from the printed tables', () => {
    const v = (n: string, b: string) => get(n, b)?.value;
    expect(v('Arsenic', 'TEC')).toBe('9.79');
    expect(v('Arsenic', 'PEC')).toBe('33.0');
    expect(v('Cadmium', 'PEC')).toBe('4.98');
    expect(v('Total PAHs', 'TEC')).toBe('1610');
    expect(v('Total PAHs', 'PEC')).toBe('22800');
    expect(v('Total DDTs', 'TEC')).toBe('5.28');
    expect(v('Total DDTs', 'PEC')).toBe('572');
    expect(v('Lindane (gamma-BHC)', 'PEC')).toBe('4.99');
    expect(v('Dibenz[a,h]anthracene', 'TEC')).toBe('33.0');
  });

  it('has a TEC below the PEC for every chemical with both', () => {
    for (const t of rows.filter((r) => r.basis === 'TEC')) {
      const p = get(t.name_printed!, 'PEC');
      if (p) expect(Number(t.value)).toBeLessThan(Number(p.value));
    }
  });
});
