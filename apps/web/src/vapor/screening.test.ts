// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { attenuationFactorRun, pviScreenRun } from '@model-flow/engine';
import { DEFAULT_FORM, toInputs, type VaporForm } from './form';
import { DEFAULT_PVI, afMediaFor, runAttenuation, runPvi, type PviForm } from './screening';

const gw: VaporForm = { ...DEFAULT_FORM, source: 'groundwater', cgw: '2' };

describe('attenuation factor panel', () => {
  it('offers the factors that act on the chosen source kind', () => {
    expect(afMediaFor('soil')).toEqual([]);
    expect(afMediaFor('soilGas').map((m) => m.value)).toEqual([
      'subSlabSoilGas',
      'exteriorSoilGas',
    ]);
    expect(afMediaFor('groundwater').map((m) => m.value)).toEqual([
      'groundwater',
      'groundwaterFineGrained',
    ]);
  });

  it('applies the 2015 factor to H prime times the groundwater concentration', () => {
    const r = runAttenuation(gw, {
      medium: 'groundwater',
      depthBelowFoundation: 3,
      preferential: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const direct = attenuationFactorRun({ medium: 'groundwater', concentration: 2e-3, H: 0.228 });
    expect(r.result.indoorAir).toBe(direct.indoorAir);
    expect(r.result.factor).toBe(0.001);
  });

  it('is not offered for a soil source', () => {
    const r = runAttenuation(DEFAULT_FORM, {
      medium: 'groundwater',
      depthBelowFoundation: 3,
      preferential: false,
    });
    expect(r.ok).toBe(false);
  });

  it('warns about a source closer than 5 ft to the foundation', () => {
    const r = runAttenuation(gw, {
      medium: 'groundwater',
      depthBelowFoundation: 1,
      preferential: true,
    });
    if (!r.ok) throw new Error('run');
    const codes = r.result.warnings.map((w) => w.code);
    expect(codes).toContain('vapor.af-shallow-source');
    expect(codes).toContain('vapor.af-preferential-pathway');
  });
});

describe('PVI panel', () => {
  const base: PviForm = { ...DEFAULT_PVI, separation: '2.8', smallestDimension: '12' };

  it('screens out a dissolved source with 6 ft or more of clean soil', () => {
    const r = runPvi({ ...base, gwBenzene: '1' }, 2.8, 150);
    if (!r.ok) throw new Error(r.error);
    expect(r.result.verdict).toBe('screened-out');
    expect(r.result.sourceType).toBe('dissolved');
  });

  it('sends an LNAPL source to further assessment below 15 ft and lists the reason', () => {
    const r = runPvi({ ...base, gwBenzene: '6', separation: '4.5' }, 2.8, 150);
    if (!r.ok) throw new Error(r.error);
    expect(r.result.sourceType).toBe('lnapl');
    expect(r.result.lnaplIndicators).toContain('groundwater benzene');
    expect(r.result.verdict).toBe('further-assessment');
    expect(r.result.separationMet).toBe(false);
  });

  it('matches the engine verdict for the same inputs', () => {
    const r = runPvi({ ...base, gwBenzene: '1', preferential: true }, 2.8, 150);
    if (!r.ok) throw new Error(r.error);
    const engine = pviScreenRun({
      groundwaterBenzene: 1e-3,
      separation: 2.8,
      smallestBuildingDimension: 12,
      preferentialPathways: true,
    });
    expect(r.result.verdict).toBe(engine.verdict);
    expect(r.result.precluding).toEqual(['preferential-pathways']);
  });

  it('uses the source to building distance and the floor area side when left blank', () => {
    const r = runPvi({ ...base, gwBenzene: '1', separation: '', smallestDimension: '' }, 7, 100);
    if (!r.ok) throw new Error(r.error);
    expect(r.result.separation).toBe(7);
  });

  it('reports an unreadable field', () => {
    const r = runPvi({ ...base, gwBenzene: 'x' }, 2.8, 150);
    expect(r.ok).toBe(false);
  });

  it('parses the same defaults as the engine form', () => {
    expect(toInputs(gw).ok).toBe(true);
  });
});
