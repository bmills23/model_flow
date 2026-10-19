import { describe, expect, it } from 'vitest';
import { exposureLegacy, type LegacyScenarioInput } from '@model-flow/engine';
import { DAY_S, YEAR_S } from '@model-flow/engine';
import { exposureUncertainty, EXPOSURE_DISPLAYS } from './uncertaintySetup';

const receptor = (label: string, water: number | undefined) => ({
  label,
  pathways: [],
  chemicals: [],
  receptor: {
    bw: 70,
    ed: 30 * YEAR_S,
    ef: 350 / 365,
    ...(water ? { waterIngestionRate: water } : {}),
  },
});

describe('exposureUncertainty', () => {
  it('offers only the inputs of the receptors present that have a base value', () => {
    const base = {
      receptors: [receptor('Resident', 2 / 1000 / DAY_S)],
    } as unknown as LegacyScenarioInput;
    const m = exposureUncertainty(base);
    const ids = (m.uncertainInputs ?? []).map((u) => u.id);
    expect(ids).toContain('exposure.receptor0.bw');
    expect(ids).toContain('exposure.receptor0.waterIngestionRate');
    expect(ids.some((i) => i.includes('receptor1'))).toBe(false);
  });

  it('drops an input the receptor does not carry', () => {
    const base = { receptors: [receptor('Worker', undefined)] } as unknown as LegacyScenarioInput;
    const ids = (exposureUncertainty(base).uncertainInputs ?? []).map((u) => u.id);
    expect(ids).not.toContain('exposure.receptor0.waterIngestionRate');
  });

  it('shows durations in years and ingestion in litres per day, converting at the boundary', () => {
    expect(EXPOSURE_DISPLAYS['exposure.receptor0.ed']).toEqual({ unit: 'yr', factor: YEAR_S });
    const d = EXPOSURE_DISPLAYS['exposure.receptor1.waterIngestionRate']!;
    expect(d.unit).toBe('L/day');
    expect(2 * d.factor).toBeCloseTo(2e-3 / DAY_S, 18);
  });

  it('runs the same descriptor as the registry', () => {
    const base = { receptors: [receptor('R', 1e-8)] } as unknown as LegacyScenarioInput;
    expect(exposureUncertainty(base).run).toBe(exposureLegacy.run);
  });
});
