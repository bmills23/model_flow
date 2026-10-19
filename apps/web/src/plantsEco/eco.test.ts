import { describe, expect, it } from 'vitest';
import { computeBenchmarks, computeEcossl } from './eco';
import { loadEcossl, substanceFor } from './ecossl';
import { DEFAULT_FORM, type PlantsEcoForm } from './form';

const form = (over: Partial<PlantsEcoForm> = {}): PlantsEcoForm => ({
  ...DEFAULT_FORM,
  soilConcentration: '100',
  ...over,
});

describe('Eco-SSL hazard quotients', () => {
  it('divides the soil concentration by the file value and flags groups with no number', async () => {
    const substances = await loadEcossl();
    const lead = substanceFor(substances, '7439-92-1-lead-and-compounds');
    expect(lead).toBeDefined();
    const r = computeEcossl(form(), lead);
    if (!r.ok) throw new Error(r.errors.join('; '));
    for (const row of r.result.rows) {
      const v = lead!.values[row.group];
      if (v.status === 'value') expect(row.hq! / (100 / v.value!)).toBeCloseTo(1, 12);
      else expect(row.hq).toBeNull();
    }
    expect(r.result.warnings.map((w) => w.code)).toContain('ECO_SCREENING_ONLY');
  });

  it('reports ECO_NO_SSL for a group whose document gives no number', async () => {
    const substances = await loadEcossl();
    const antimony = substanceFor(substances, '7440-36-0')!;
    // the file prints NA for antimony plants and birds
    const r = computeEcossl(form(), antimony);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.rows.find((x) => x.group === 'plants')!.hq).toBeNull();
    expect(r.result.warnings.map((w) => w.code)).toContain('ECO_NO_SSL');
  });

  it('marks the DDT value as one for the sum of the three records', async () => {
    const substances = await loadEcossl();
    const ddt = substanceFor(substances, '72-55-9')!;
    const r = computeEcossl(form(), ddt);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.combined).toBe(true);
  });

  it('refuses a chemical with no document and a missing soil concentration', async () => {
    expect(computeEcossl(form(), undefined).ok).toBe(false);
    const substances = await loadEcossl();
    expect(computeEcossl(form({ soilConcentration: '' }), substances[0]).ok).toBe(false);
  });
});

describe('legacy benchmarks', () => {
  it('needs a citation and gives the hazard quotient with ECO_BENCHMARK_USER_ENTERED', () => {
    const f = form({
      benchmarks: [{ receptor: 'Earthworm', value: '50', citation: 'sample1996' }],
    });
    const r = computeBenchmarks(f);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.rows[0]!.hq / 2).toBeCloseTo(1, 12);
    expect(r.warnings.map((w) => w.code)).toContain('ECO_BENCHMARK_USER_ENTERED');
    const none = computeBenchmarks(
      form({ benchmarks: [{ receptor: 'Earthworm', value: '50', citation: '' }] }),
    );
    expect(none.ok).toBe(false);
  });

  it('asks for a benchmark when there are none', () => {
    expect(computeBenchmarks(form()).ok).toBe(false);
  });
});
