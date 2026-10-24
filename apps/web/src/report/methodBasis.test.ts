import { describe, expect, it } from 'vitest';
import { defaultScreens, type Screens } from '../project';
import {
  basisChoice,
  criteriaDisagreements,
  methodBasisOf,
  riskDisagreements,
} from './methodBasis';

const screens = (edit: (s: Screens) => void): Screens => {
  const s = defaultScreens();
  edit(s);
  return s;
};

describe('basisChoice', () => {
  it('takes the method the screen shows', () => {
    const s = screens((x) => {
      x.vadose = { ...x.vadose, form: { ...x.vadose.form, method: 'modern' } };
      x.transport = { ...x.transport, form: { ...x.transport.form, mapMethod: 'legacy' } };
    });
    expect(basisChoice('vadose', s, null)).toEqual({ basis: 'modern', from: 'screen' });
    expect(basisChoice('transport', s, null)).toEqual({ basis: 'legacy', from: 'screen' });
  });

  it('takes the modern method when the screen shows both or offers no choice', () => {
    const s = screens((x) => {
      x.saturated = { ...x.saturated, form: { ...x.saturated.form, method: 'both' } };
    });
    expect(basisChoice('saturated', s, null)).toEqual({ basis: 'modern', from: 'default' });
    expect(basisChoice('risk', s, null)).toEqual({ basis: 'modern', from: 'default' });
    expect(basisChoice('cleanup', s, null)).toEqual({ basis: 'modern', from: 'default' });
  });

  it('takes the oxygen-limited method when the vapor screen shows it', () => {
    const s = screens((x) => {
      x.vapor = { ...x.vapor, form: { ...x.vapor.form, method: 'devaull' } };
    });
    expect(basisChoice('vapor', s, null)).toEqual({ basis: 'oxygen-limited', from: 'screen' });
  });

  it('takes the surface water method that was sent to the risk screen, else the modern one', () => {
    const s = defaultScreens();
    expect(basisChoice('surfaceWater', s, null)).toEqual({ basis: 'modern', from: 'default' });
    expect(basisChoice('surfaceWater', s, 'well-mixed')).toEqual({
      basis: 'legacy',
      from: 'sent',
    });
    expect(basisChoice('surfaceWater', s, 'mass-discharge')).toEqual({
      basis: 'modern',
      from: 'sent',
    });
  });

  it('is null for a screen that does not show legacy against modern', () => {
    expect(basisChoice('household', defaultScreens(), null)).toBeNull();
    expect(basisChoice('plantsEco', defaultScreens(), null)).toBeNull();
    expect(basisChoice('uncertainty', defaultScreens(), null)).toBeNull();
  });
});

describe('methodBasisOf', () => {
  it('states the basis, calls the other method a sensitivity and flags a disagreement', () => {
    const b = methodBasisOf({ basis: 'modern', from: 'default' }, [
      'Surface water, organism only: legacy ratio 1.02 (exceeds), modern ratio 0.3 (does not exceed).',
    ]);
    expect(b.statement).toMatch(/rest on the modern method/);
    expect(b.statement).toMatch(/does not offer a choice of method/);
    expect(b.statement).toMatch(/legacy method.* sensitivity/);
    expect(b.disagreements).toHaveLength(1);
  });

  it('says the screen chose it when it did, and names the other methods for the oxygen-limited basis', () => {
    const screen = methodBasisOf({ basis: 'legacy', from: 'screen' }, []);
    expect(screen.statement).toMatch(/rest on the legacy method, the method shown on the screen/);
    expect(screen.statement).toMatch(/modern method.* sensitivity/);
    const ox = methodBasisOf({ basis: 'oxygen-limited', from: 'screen' }, []);
    expect(ox.statement).toMatch(/oxygen-limited method/);
    expect(ox.statement).toMatch(/legacy and modern methods.* sensitivity/);
  });

  it('names the sent method for surface water', () => {
    const b = methodBasisOf({ basis: 'legacy', from: 'sent' }, []);
    expect(b.statement).toMatch(/sent to the exposure and risk screen/);
  });
});

describe('criteriaDisagreements', () => {
  const row = (method: string, over: Record<string, unknown>) => ({
    chemical: 'Trichloroethylene',
    method,
    medium: 'surface water',
    basis: 'human health, organism only',
    waterType: 'freshwater',
    criterion: 'organism-only',
    status: 'compared',
    ratio: 1.02,
    exceeds: true,
    ...over,
  });

  it('flags a criterion the methods disagree on, with both ratios', () => {
    const out = criteriaDisagreements([
      row('surfaceWater.well-mixed', { ratio: 1.02, exceeds: true }),
      row('surfaceWater.mass-discharge', { ratio: 0.3, exceeds: false }),
    ]);
    expect(out).toEqual([
      'Trichloroethylene, surface water, human health, organism only (freshwater): legacy ratio 1.02 (exceeds), modern ratio 0.3 (does not exceed).',
    ]);
  });

  it('flags nothing when both exceed, neither exceeds or a criterion was not compared', () => {
    expect(
      criteriaDisagreements([
        row('surfaceWater.well-mixed', {}),
        row('surfaceWater.mass-discharge', { ratio: 4 }),
        row('surfaceWater.well-mixed', { criterion: 'b', ratio: 0.1, exceeds: false }),
        row('surfaceWater.mass-discharge', { criterion: 'b', ratio: 0.2, exceeds: false }),
        row('surfaceWater.well-mixed', { criterion: 'c', status: 'site-specific', exceeds: null }),
        row('surfaceWater.mass-discharge', { criterion: 'c', exceeds: false }),
      ]),
    ).toEqual([]);
  });
});

describe('riskDisagreements', () => {
  const r = (method: string, cancerRisk: number | null, hazardIndex: number | null) => ({
    method,
    receptor: 'Resident',
    cancerRisk,
    hazardIndex,
  });

  it('flags a benchmark the methods land on opposite sides of', () => {
    const out = riskDisagreements([
      r('exposure.rags-a-1989', 8e-7, 0.4),
      r('exposure.rags-e-f-2014', 3e-6, 1.3),
    ]);
    expect(out).toEqual([
      'Resident, cancer risk against 1e-6: legacy 8.0e-7 (below), modern 3.0e-6 (above).',
      'Resident, hazard index against 1: legacy 0.4 (below), modern 1.3 (above).',
    ]);
  });

  it('ignores a value that was not quantified and a pair on the same side', () => {
    expect(
      riskDisagreements([
        r('exposure.rags-a-1989', null, 0.4),
        r('exposure.rags-e-f-2014', 3e-6, 0.6),
      ]),
    ).toEqual([]);
  });
});
