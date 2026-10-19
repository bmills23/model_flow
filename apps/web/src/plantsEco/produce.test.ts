import { describe, expect, it } from 'vitest';
import { efhHomeProducedIntake, briggsRootConcentrationFactor } from '@model-flow/engine';
import { buildProduceFeed, computeProduce } from './produce';
import { DEFAULT_FORM, type PlantsEcoForm } from './form';

// Arbitrary test inputs, not chemical data: the tests check wiring and unit conversion only.
const modernForm = (over: Partial<PlantsEcoForm> = {}): PlantsEcoForm => ({
  ...DEFAULT_FORM,
  chemicalId: 'test',
  chemicalName: 'Test chemical',
  logKow: '3',
  moistureFraction: '0.8',
  bulkDensity: '1.5',
  kd: '5',
  soilConcentration: '10',
  ...over,
});

const legacyForm = (over: Partial<PlantsEcoForm> = {}): PlantsEcoForm =>
  modernForm({
    uptake: 'legacy',
    waterFilledPorosity: '0.3',
    tscf: '0.5',
    transpiration: '1',
    conductance: '10',
    leafArea: '0.5',
    plantMass: '0.2',
    kLeafAir: '1000',
    lossRate: '0.05',
    ...over,
  });

describe('computeProduce, modern (HHRAP fallback)', () => {
  it('reproduces the Travis and Arms factor by hand for above-ground produce', () => {
    const r = computeProduce(modernForm());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const exposed = r.row.classes.find((c) => c.cls === 'abovegroundExposed')!;
    // Br = 10^(1.588 - 0.578 log Kow) dry weight, times (1 - moisture) for fresh weight
    const hand = Math.pow(10, 1.588 - 0.578 * 3) * (1 - 0.8);
    expect(exposed.factor! / hand).toBeCloseTo(1, 10);
    expect(exposed.plantMgPerKg! / (hand * 10)).toBeCloseTo(1, 10);
  });

  it('reproduces the root factor with Kd converted from L/kg to m3/kg', () => {
    const r = computeProduce(modernForm());
    if (!r.ok) throw new Error(r.errors.join('; '));
    const root = r.row.classes.find((c) => c.cls === 'root')!;
    const rcfDw = briggsRootConcentrationFactor(3).value / (1 - 0.87);
    const hand = (rcfDw / 5) * (1 - 0.8); // the empirical correction is 1 at log Kow 3
    expect(root.factor! / hand).toBeCloseTo(1, 10);
  });

  it('asks for the moisture fraction and never assumes one', () => {
    const r = computeProduce(modernForm({ moistureFraction: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/moisture fraction.*required/i);
  });

  it('takes Kd from Koc times foc when Kd is blank', () => {
    const a = computeProduce(modernForm({ kd: '', koc: '100', foc: '0.05' }));
    const b = computeProduce(modernForm({ kd: '5' }));
    if (!a.ok || !b.ok) throw new Error('expected both to compute');
    expect(a.row.factors.root! / b.row.factors.root!).toBeCloseTo(1, 12);
  });

  it('requires a bioconcentration factor for an inorganic and uses it', () => {
    const none = computeProduce(modernForm({ inorganic: true }));
    expect(none.ok).toBe(false);
    const r = computeProduce(modernForm({ inorganic: true, userBcf: '0.2' }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.row.factors.abovegroundExposed! / (0.2 * (1 - 0.8))).toBeCloseTo(1, 12);
  });
});

describe('computeProduce, legacy (Briggs with the one-compartment leaf)', () => {
  it('reproduces the steady-state leaf factor by hand', () => {
    const r = computeProduce(legacyForm());
    if (!r.ok) throw new Error(r.errors.join('; '));
    const above = r.row.classes.find((c) => c.cls === 'abovegroundExposed')!;
    // pore water per unit soil, SI: rho_b / (theta + rho_b Kd) with rho_b 1500 kg/m3 and Kd 0.005 m3/kg
    const cpw = 1500 / (0.3 + 1500 * 0.005);
    const source = 0.5 * (1 / 1000) * cpw; // TSCF Q C_pw, Q in m3/d
    const k = (10 * 0.5) / 1000 + 0.05 * 0.2; // g A / K_la + lambda M
    expect(above.factor! / (source / k)).toBeCloseTo(1, 10);
  });

  it('needs the leaf inputs only when an above-ground class is eaten', () => {
    const rootOnly = legacyForm({
      intakeMode: 'custom',
      custom: {
        abovegroundExposed: { gPerKgDay: '', loss: '', homegrown: '' },
        abovegroundProtected: { gPerKgDay: '', loss: '', homegrown: '' },
        root: { gPerKgDay: '1', loss: '', homegrown: '1' },
      },
      tscf: '',
      transpiration: '',
    });
    const r = computeProduce(rootOnly);
    expect(r.ok).toBe(true);
    const both = computeProduce(legacyForm({ tscf: '' }));
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.errors.join(' ')).toMatch(/TSCF/);
  });

  it('refuses a leaf with no loss rather than dividing by zero', () => {
    const r = computeProduce(legacyForm({ conductance: '0', lossRate: '0' }));
    expect(r.ok).toBe(false);
  });
});

describe('intake', () => {
  it('uses the handbook preset for the chosen age group', () => {
    const r = computeProduce(modernForm({ ageGroup: '3 to 5' }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.row.intakes).toEqual(efhHomeProducedIntake('3 to 5').intakes);
    expect(r.row.intakeLabel).toMatch(/ages 3 to 5/);
  });

  it('lists what the handbook withholds for an age group', () => {
    const r = computeProduce(modernForm({ ageGroup: '1 to 2' }));
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.row.omitted).toEqual(efhHomeProducedIntake('1 to 2').omitted);
  });

  it('needs the homegrown fraction for a custom intake and has no default', () => {
    const r = computeProduce(
      modernForm({
        intakeMode: 'custom',
        custom: {
          abovegroundExposed: { gPerKgDay: '2', loss: '', homegrown: '' },
          abovegroundProtected: { gPerKgDay: '', loss: '', homegrown: '' },
          root: { gPerKgDay: '', loss: '', homegrown: '' },
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/fraction homegrown is required/i);
  });
});

describe('buildProduceFeed', () => {
  it('carries the factors, the intake and the method to the risk screen', () => {
    const form = modernForm();
    const result = computeProduce(form);
    const feed = buildProduceFeed(form, result);
    expect(feed.ok).toBe(true);
    if (!feed.ok || !result.ok) return;
    expect(feed.feed.chemicalId).toBe('test');
    expect(feed.feed.method).toBe('plantUptake.hhrap-2005');
    expect(feed.feed.factors).toEqual(result.row.factors);
    expect(feed.feed.intakes).toEqual(result.row.intakes);
  });

  it('is refused without a chemical id or with inputs missing', () => {
    expect(buildProduceFeed(modernForm({ chemicalId: '' }), computeProduce(modernForm())).ok).toBe(
      false,
    );
    const bad = modernForm({ moistureFraction: '' });
    expect(buildProduceFeed(bad, computeProduce(bad)).ok).toBe(false);
  });
});
