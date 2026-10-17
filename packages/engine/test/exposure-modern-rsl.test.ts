import { describe, expect, it } from 'vitest';
import { modernPathway } from '../src/processes/exposure/modern.js';
import {
  modernChemical,
  modernResident,
  modernWorker,
  type ModernChemicalBoundary,
} from '../src/processes/exposure/receptorsModern.js';
import type { PathwayId } from '../src/processes/exposure/units.js';
import fixture from './fixtures/exposure/rsl-2024-11.json' with { type: 'json' };

// Independent check against the EPA RSL tables, November 2024 (fixture plan, item 2): the engine's
// screening level (target over the linear coefficient) must round to the published two-figure value.

const SI_PER_UNIT: Record<string, number> = { 'mg/kg': 1e-6, 'ug/L': 1e-6, 'ug/m3': 1e-9 };

function withinHalfUnit(second: number, published: number): boolean {
  const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
  return Math.abs(second - published) <= 0.5 * unit * (1 + 1e-9);
}

const chemicals = fixture.chemicals as Record<string, ModernChemicalBoundary>;

describe('RSL November 2024 independent check (modern method)', () => {
  for (const c of fixture.cases) {
    const chem = modernChemical(chemicals[c.chemical]!);
    const receptor = c.receptor === 'worker' ? modernWorker() : modernResident();
    const cell = modernPathway(c.pathway as PathwayId, receptor, chem, 1);
    const scale = SI_PER_UNIT[c.unit]!;

    it(`${c.chemical}, ${c.table}, ${c.pathway}: cancer`, () => {
      if (c.cancer === null) {
        expect(cell.riskPerEpc).toBeNull();
        return;
      }
      const sl = 1e-6 / cell.riskPerEpc! / scale;
      expect(withinHalfUnit(sl, c.cancer), `engine ${sl}, published ${c.cancer}`).toBe(true);
    });

    it(`${c.chemical}, ${c.table}, ${c.pathway}: noncancer`, () => {
      if (c.noncancer === null) {
        expect(cell.hqPerEpc).toBeNull();
        return;
      }
      const sl = 1 / cell.hqPerEpc! / scale;
      expect(withinHalfUnit(sl, c.noncancer), `engine ${sl}, published ${c.noncancer}`).toBe(true);
    });
  }

  it('covers every chemical, pathway family and receptor named by the note', () => {
    expect(new Set(fixture.cases.map((c) => c.table))).toEqual(
      new Set(['resident soil', 'composite worker soil', 'resident tap water', 'resident air']),
    );
    expect(fixture.cases.length).toBeGreaterThanOrEqual(20);
  });
});
