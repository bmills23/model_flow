import { describe, expect, it } from 'vitest';
import {
  CLASS_IDS,
  SWEEP_IDS,
  engineAirLevel,
  engineCoef,
  engineLevel,
  levels,
  runRslSweep,
  type ClassId,
  type PathwayName,
  type SweepCounts,
  type SweepId,
  type UnexplainedCell,
  withinHalfUnit,
} from './rslSweepHelpers.js';
import exceptions from './fixtures/rsl-sweep/exceptions.json' with { type: 'json' };

// Sweep of the published EPA RSL screening levels, November 2024 (tap water 405290, resident soil 405274,
// industrial soil 405278, resident air 405282, summary 405270), against the engine's unrounded values.
// Every published cell of the swept columns is compared by the rule of the existing reproductions: the
// engine's value must lie within half a unit of the second significant figure of the printed value
// (`withinHalfUnit`, rslSweepHelpers.ts). The data file holds at most two significant figures in every
// column, which is why that rule is the one used; no tolerance is widened. A cell that does not reproduce
// is a named exception with its reason (fixtures/rsl-sweep/exceptions.json), or it is counted and printed
// as unexplained.
//
// The tap water inhalation cells are the resident air level divided by the household factor K (0.5 L/m^3),
// so they test K.
//
// published-reproduction: rsl-sweep-tapwater
// published-reproduction: rsl-sweep-soil-resident
// published-reproduction: rsl-sweep-soil-industrial
// published-reproduction: rsl-sweep-air

interface Fixture {
  sweeps: Record<SweepId, SweepCounts>;
  classes: {
    id: ClassId;
    reason: string;
    cells: Partial<Record<SweepId, number>>;
    chemicals: string[];
  }[];
  unexplained: UnexplainedCell[];
  householdK: { lPerM3: number; cells: number; reproduced: number };
}
const fixture = exceptions as unknown as Fixture;

const result = runRslSweep();

describe('RSL screening-level sweep: counts', () => {
  it('compares every published cell of the swept columns', () => {
    const published = (ids: string[]): number =>
      levels.columns.filter((c) => ids.includes(c.id)).reduce((n, c) => n + c.count, 0);
    const inMedium = (m: string): string[] =>
      levels.columns.filter((c) => c.id.startsWith(`${m}.`)).map((c) => c.id);
    expect(result.sweeps.tapwater.compared).toBe(published(inMedium('tapwater')));
    expect(result.sweeps['soil-resident'].compared).toBe(published(inMedium('soil-resident')));
    expect(result.sweeps['soil-industrial'].compared).toBe(published(inMedium('soil-industrial')));
    expect(result.sweeps.air.compared).toBe(
      published([...inMedium('air-resident'), 'summary.air-industrial.governing']),
    );
  });

  it('accounts for every compared cell exactly once', () => {
    for (const id of SWEEP_IDS) {
      const c = result.sweeps[id];
      expect(c.reproduced + c.excepted + c.unexplained, id).toBe(c.compared);
    }
  });

  it('matches the counts recorded in the fixture', () => {
    expect(result.sweeps).toEqual(fixture.sweeps);
  });
});

describe('RSL screening-level sweep: named exceptions', () => {
  it('lists the exception classes of the fixture with their counts and chemicals', () => {
    expect(fixture.classes.map((c) => c.id)).toEqual([...CLASS_IDS]);
    for (const c of fixture.classes) {
      expect(c.cells, c.id).toEqual(result.classes[c.id].cells);
      expect(c.chemicals, c.id).toEqual(result.classes[c.id].chemicals);
    }
  });

  it('gives every class a reason and counts the excepted cells of the sweeps', () => {
    for (const c of fixture.classes) expect(c.reason.length, c.id).toBeGreaterThan(40);
    for (const id of SWEEP_IDS) {
      const total = fixture.classes.reduce((n, c) => n + (c.cells[id] ?? 0), 0);
      expect(total, id).toBe(result.sweeps[id].excepted);
    }
  });

  it('keeps no class that excepts nothing', () => {
    for (const c of fixture.classes) {
      expect(
        Object.values(c.cells).reduce((n, x) => n + (x ?? 0), 0),
        c.id,
      ).toBeGreaterThan(0);
    }
  });

  it('writes no em dash in the fixture', () => {
    expect(JSON.stringify(fixture)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('RSL screening-level sweep: unexplained cells', () => {
  it('prints every unexplained cell with the published and the computed value, and hides none', () => {
    expect(result.unexplained).toEqual(fixture.unexplained);
    for (const id of SWEEP_IDS) {
      expect(result.unexplained.filter((u) => u.sweep === id).length, id).toBe(
        result.sweeps[id].unexplained,
      );
    }
  });
});

describe('RSL screening-level sweep: the household factor K', () => {
  it('reproduces the tap water inhalation levels as the resident air level over K', () => {
    // the 265 published inhalation cells of the tap water table (93 cancer, 172 noncancer)
    expect(result.householdK.cells).toBe(265);
    expect(fixture.householdK.lPerM3).toBe(0.5);
    expect(result.householdK).toEqual({
      cells: fixture.householdK.cells,
      reproduced: fixture.householdK.reproduced,
    });
  });

  it('reproduces every tap water inhalation cell, the trichloroethylene and vinyl chloride cancer cells included', () => {
    // identify the cells that did not reproduce from the cells themselves, not from a class list
    const missed: string[] = [];
    for (const col of levels.columns.filter((c) => c.id.startsWith('tapwater.inhalation.'))) {
      const endpoint = col.id.split('.')[2] as 'cancer' | 'noncancer';
      for (const ch of levels.chemicals) {
        const cell = ch.values[col.id];
        if (cell === undefined) continue;
        const computed = engineLevel(
          engineCoef('tapwater', 'inhalation', ch.id, { dermal: false, inhalation: true }),
          endpoint,
          col.units,
        );
        if (typeof computed !== 'number' || !withinHalfUnit(computed, cell.value)) {
          missed.push(`${ch.name}|${col.id}`);
        }
      }
    }
    expect(missed).toEqual([]);
    expect(result.householdK.reproduced).toBe(result.householdK.cells);
  });
});

describe('RSL screening-level sweep: the special-case cancer equations', () => {
  const special = ['Trichloroethylene', 'Vinyl Chloride'].map((name) =>
    levels.chemicals.find((c) => c.name === name)!,
  );

  it('reproduces every trichloroethylene and vinyl chloride cell the engine computes, with no exception class', () => {
    // the cancer cells the equations change: tap water (four pathways), resident soil ingestion, resident air
    const columns = [
      'tapwater.ingestion.cancer',
      'tapwater.dermal.cancer',
      'tapwater.inhalation.cancer',
      'tapwater.total.cancer',
      'soil-resident.ingestion.cancer',
      'air-resident.inhalation.cancer',
    ];
    for (const ch of special) {
      for (const id of columns) {
        const cell = ch.values[id];
        expect(cell, `${ch.name} ${id} is published`).toBeDefined();
        const col = levels.columns.find((c) => c.id === id)!;
        const medium = id.split('.')[0]!;
        const computed =
          medium === 'air-resident'
            ? engineAirLevel(ch.id, 'resident', 'cancer')
            : engineLevel(
                engineCoef(medium, id.split('.')[1] as PathwayName, ch.id, {
                  dermal: ch.values[`${medium}.dermal.cancer`] !== undefined,
                  inhalation: ch.values[`${medium}.inhalation.cancer`] !== undefined,
                }),
                'cancer',
                col.units,
              );
        expect(typeof computed, `${ch.name} ${id}`).toBe('number');
        expect(withinHalfUnit(computed as number, cell!.value), `${ch.name} ${id}`).toBe(true);
      }
    }
  });

  it('keeps no exception class for the two chemicals', () => {
    // the only cells of the two chemicals still excepted are the soil inhalation cells and the soil totals
    // that include them (the volatilization factor is not computed here), under their own classes
    expect(fixture.classes.map((c) => c.id)).not.toContain('special-case-equations');
    expect(CLASS_IDS as readonly string[]).not.toContain('special-case-equations');
    for (const u of result.unexplained) {
      expect(['Trichloroethylene', 'Vinyl Chloride'], u.name).not.toContain(u.name);
    }
  });
});

describe('RSL screening-level sweep: what the sweep leaves out', () => {
  it('reads the resident air summary level as the lower of the two sheet levels, so it adds no cells', () => {
    let rows = 0;
    for (const ch of levels.chemicals) {
      const s = ch.values['summary.air-resident.governing'];
      if (s === undefined) continue;
      const sheet = ['cancer', 'noncancer']
        .map((e) => ch.values[`air-resident.inhalation.${e}`]?.value)
        .filter((x): x is number => x !== undefined);
      rows += 1;
      expect(s.value, ch.name).toBe(Math.min(...sheet));
    }
    expect(rows).toBe(367);
  });

  it('rejects an engine value outside half a unit of the second figure, so the comparison can fail', () => {
    expect(withinHalfUnit(0.00785, 0.0078)).toBe(true);
    expect(withinHalfUnit(0.007852, 0.0078)).toBe(false);
    expect(withinHalfUnit(31285714, 31000)).toBe(false);
  });
});

describe('RSL screening-level sweep: industrial air key letters', () => {
  it('names the endpoint the engine finds governing in every reproduced cell', () => {
    expect(result.keyLetters.checked).toBeGreaterThan(300);
    expect(result.keyLetters.agree).toBe(result.keyLetters.checked);
  });
});
