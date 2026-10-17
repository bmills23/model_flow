import { describe, expect, it } from 'vitest';
import { backCalculateModern } from '../src/processes/cleanup/direct.js';
import { partitionFactor } from '../src/processes/cleanup/ssg.js';
import {
  modernChemical,
  modernResident,
  type ModernChemicalBoundary,
} from '../src/processes/exposure/receptorsModern.js';
import rsl from './fixtures/exposure/rsl-2024-11.json' with { type: 'json' };
import cleanup from './fixtures/cleanup/rsl-2024-11-cleanup.json' with { type: 'json' };

// Fixture 3 of docs/methods/cleanup-levels.md: RSL risk-based soil-to-groundwater SSL (DAF 1) for
// chemicals without a household-use inhalation term, from the back-calculated tap water level
// (modern resident, drinking water plus bathing) times the SSG partition factor (slice C1).

const boundaries = rsl.chemicals as unknown as Record<string, ModernChemicalBoundary>;
const { soil } = cleanup.riskBasedSsl;

function withinHalfUnit(value: number, published: number): boolean {
  const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
  return Math.abs(value - published) <= 0.5 * unit * (1 + 1e-9);
}

describe('RSL risk-based SSL at DAF 1 from the back-calculated tap water level', () => {
  for (const c of cleanup.riskBasedSsl.cases) {
    it(c.chemical, () => {
      const water = backCalculateModern({
        receptors: [
          {
            label: 'resident',
            receptor: modernResident(),
            pathways: ['waterIngestion', 'waterDermal'],
          },
        ],
        chemicals: [{ id: c.chemical, chemical: modernChemical(boundaries[c.chemical]!) }],
      }).media[0]!.levels[0]!.level!;
      const p = partitionFactor({
        soil: {
          rhoB: soil.bulkDensityKgPerL * 1000,
          rhoS: soil.particleDensityKgPerL * 1000,
          foc: soil.foc,
          theta: soil.waterFilledPorosity,
        },
        ...('kdLPerKg' in c ? { kd: c.kdLPerKg * 1e-3 } : { koc: c.kocLPerKg * 1e-3 }),
        H: c.hPrime,
      });
      const mgPerKg = water * p * 1e6;
      expect(withinHalfUnit(mgPerKg, c.published), `${mgPerKg} vs ${c.published}`).toBe(true);
    });
  }
});
