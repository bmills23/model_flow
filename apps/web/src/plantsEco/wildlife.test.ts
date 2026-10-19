import { describe, expect, it } from 'vitest';
import { loadEcossl, substanceFor } from './ecossl';
import { DEFAULT_FORM, type PlantsEcoForm, type WildlifeRowForm } from './form';
import { computeWildlife, wildlifeRowsFor } from './wildlife';

const form = (over: Partial<PlantsEcoForm> = {}): PlantsEcoForm => ({
  ...DEFAULT_FORM,
  soilConcentration: '100',
  ...over,
});

const userRow: WildlifeRowForm = {
  group: 'mammalian',
  surrogate: 'user',
  table: '',
  page: '',
  trv: '2',
  fir: '0.1',
  ps: '0.1',
  auf: '0.5',
  form: 'ratio',
  a: '0.5',
  b: '',
  cdiet: '',
  printed: '',
};

describe('wildlife dose panel', () => {
  it('prefills surrogate rows from the Eco-SSL derivation with table and page', async () => {
    const lead = substanceFor(await loadEcossl(), '7439-92-1-lead-and-compounds')!;
    const rows = wildlifeRowsFor(lead);
    expect(rows).toHaveLength(6);
    const dove = rows.find((r) => r.group === 'avian' && r.surrogate === 'dove')!;
    expect(dove.table).not.toBe('');
    expect(dove.page).not.toBe('');
    expect(dove.auf).toBe('1');
    expect(dove.form).toBe('ln');
  });

  it('reproduces the printed Eco-SSL of every prefilled row within 5 percent', async () => {
    const substances = await loadEcossl();
    const lead = substanceFor(substances, '7439-92-1-lead-and-compounds')!;
    const cadmium = substances.find((s) => s.substance === 'cadmium')!;
    for (const sub of [lead, cadmium]) {
      const rows = wildlifeRowsFor(sub);
      expect(rows.length).toBeGreaterThan(0);
      const r = computeWildlife(form({ wildlifeRows: rows }));
      if (!r.ok) throw new Error(r.errors.join('; '));
      for (const row of r.rows) {
        expect(row.backCalcMgPerKg).not.toBeNull();
        const rel = Math.abs(row.backCalcMgPerKg! - row.printedMgPerKg!) / row.printedMgPerKg!;
        expect(rel).toBeLessThan(0.05);
      }
    }
  });

  it('hazard quotient is the dose over the toxicity reference value at the soil concentration', () => {
    const r = computeWildlife(form({ soilConcentration: '10', wildlifeRows: [userRow] }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    // dose = (10 * 0.5 + 10 * 0.1) * 0.1 * 0.5 = 0.3 mg/kg/d; hq = 0.15
    expect(r.rows[0]!.doseMgPerKgD).toBeCloseTo(0.3, 12);
    expect(r.rows[0]!.hq).toBeCloseTo(0.15, 12);
    expect(r.warnings.map((w) => w.code)).toContain('ECO_SCREENING_ONLY');
  });

  it('asks for rows and for the soil concentration, and refuses bad factors', () => {
    expect(computeWildlife(form()).ok).toBe(false);
    expect(computeWildlife(form({ wildlifeRows: [{ ...userRow, ps: '1.5' }] })).ok).toBe(false);
    expect(computeWildlife(form({ soilConcentration: '', wildlifeRows: [userRow] })).ok).toBe(
      false,
    );
  });
});
