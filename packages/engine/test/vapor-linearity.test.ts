import { describe, expect, it } from 'vitest';
import {
  attenuationFactorRun,
  juryFlux,
  pviScreenRun,
  type JuryInput,
} from '../src/processes/vapor/index.js';
import {
  boxConcentrationFromFlux,
  ssgVolatilizationFactor,
  steadyDiffusionFlux,
  type OutdoorBox,
} from '../src/processes/outdoorAir/index.js';

/**
 * Wave K slice K1, ruling 1: which vapor and outdoor air methods are linear in the source, so the cleanup
 * screen may divide an air level by an air-over-source coefficient. Each test doubles the source and checks
 * the air doubles (the indoor and outdoor Johnson and Ettinger paths are tested on the web side, where the
 * screen's inputs live).
 */
const rel = (a: number, ref: number): number => Math.abs(a - ref) / Math.abs(ref);

describe('linearity of the vapor and outdoor air methods in the source', () => {
  it('vapor.jury-bam: the flux at every time is proportional to the initial concentration', () => {
    const base: JuryInput = {
      chemical: { Da: 8.7e-6, Dw: 9.8e-10, H: 0.22 },
      soil: { porosity: 0.434, moisture: 0.15, bulkDensity: 1500, kd: 3.42e-4 },
      layerThickness: 1.5,
      coverThickness: 0.3,
      boundaryLayerThickness: 0.1,
      decayRate: 1e-8,
      initialConcentration: 1.5,
    };
    const doubled = { ...base, initialConcentration: 3 };
    for (const t of [1e3, 1e5, 1e7, 5e8]) {
      expect(rel(juryFlux(doubled, t), 2 * juryFlux(base, t))).toBeLessThan(1e-12);
    }
  });

  it('vapor.attenuation-factor-2015: indoor air is the factor times the (equilibrium) vapor', () => {
    for (const medium of ['groundwater', 'groundwaterFineGrained'] as const) {
      const one = attenuationFactorRun({ medium, concentration: 1e-3, H: 0.25 });
      const two = attenuationFactorRun({ medium, concentration: 2e-3, H: 0.25 });
      expect(rel(two.indoorAir, 2 * one.indoorAir)).toBeLessThan(1e-12);
    }
    for (const medium of ['subSlabSoilGas', 'exteriorSoilGas', 'crawlspace'] as const) {
      const one = attenuationFactorRun({ medium, concentration: 1e-3 });
      const two = attenuationFactorRun({ medium, concentration: 2e-3 });
      expect(rel(two.indoorAir, 2 * one.indoorAir)).toBeLessThan(1e-12);
    }
  });

  it('vapor.pvi-screen-2015: gives a verdict, no air concentration, so no coefficient exists', () => {
    const r = pviScreenRun({ groundwaterBenzene: 1e-3, separation: 3 });
    expect(Object.keys(r)).not.toContain('indoorAir');
    expect(Object.keys(r)).not.toContain('concentration');
    expect(['screened-out', 'further-assessment']).toContain(r.verdict);
  });

  it('outdoorAir.ssg-vf-1996: the volatilization factor takes no concentration, so air = F / vf in both branches', () => {
    const soil = { porosity: 0.434, moisture: 0.15, bulkDensity: 1500, kd: 3.42e-4 };
    const chemical = { Da: 8.7e-6, Dw: 9.8e-10, H: 0.22 };
    const infinite = ssgVolatilizationFactor({ chemical, soil });
    expect(infinite.massLimited).toBe(false);
    // A shallow source makes the mass-limit branch govern; it depends on depth and time, not on F.
    const limited = ssgVolatilizationFactor({ chemical, soil, sourceDepth: 1e-3 });
    expect(limited.massLimited).toBe(true);
    for (const r of [infinite, limited]) {
      for (const F of [1e-6, 1e-5]) {
        expect(rel((2 * F) / r.vf, 2 * (F / r.vf))).toBeLessThan(1e-15);
      }
    }
    expect(limited.vf).toBeGreaterThan(infinite.vf);
  });

  it('outdoorAir.box: the concentration is proportional to the flux, and the flux to the source vapor', () => {
    const box: OutdoorBox = { length: 10, width: 4, height: 2, windSpeed: 2.25 };
    const layers = [
      { thickness: 1, porosity: 0.4, moisture: 0.15 },
      { thickness: 0.5, porosity: 0.43, moisture: 0.1 },
    ];
    const chem = { Da: 8.7e-6, Dw: 9.8e-10, H: 0.22 };
    const f1 = steadyDiffusionFlux(layers, chem, 1e-3);
    const f2 = steadyDiffusionFlux(layers, chem, 2e-3);
    expect(rel(f2, 2 * f1)).toBeLessThan(1e-12);
    expect(
      rel(boxConcentrationFromFlux(box, f2), 2 * boxConcentrationFromFlux(box, f1)),
    ).toBeLessThan(1e-12);
  });
});
