import { describe, expect, it } from 'vitest';
import {
  ANSWER_QUANTITIES,
  CLASSES,
  COLUMN,
  COMPARISON_IDS,
  ENGINE_FACTORS,
  FIXTURE_IDS,
  NUMERIC_QUANTITIES,
  RUNS,
  contextOf,
  countOf,
  judge,
  printedDigits,
  printedFactors,
  printedUnit,
  quantitiesOf,
  runFixture,
  tableOf,
  withinPrinted,
  type CellOutcome,
  type ClassId,
  type ComparisonId,
  type Counts,
  type FixtureId,
} from './vislSweepHelpers.js';
import exceptions from './fixtures/visl-sweep/exceptions.json' with { type: 'json' };

// Comparison of the engine with the EPA VISL calculator, edition of 2024-11-13 (retrieved 2026-10-22) in
// three runs: resident at the form defaults (25 deg C, hazard quotient 0.1, target risk 1e-6), resident with
// groundwater at 10 deg C, hazard quotient 1 and target risk 1e-5, and commercial at the form defaults. Five
// chemicals each (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene). Every numeric
// output the engine can compute and every yes or no answer it has a criterion for is compared, twice: (1) from
// the calculator's own printed inputs, which checks the engine's equations, and (2) from the database the app
// ships, which checks what a user of the app gets. A numeric cell reproduces when the engine's unrounded value
// lies within half a unit of the last printed digit (three significant figures, asserted below); nothing is
// widened. A cell that does not reproduce is a named exception with a reason that the test itself verifies
// (fixtures/visl-sweep/exceptions.json), or it is counted and printed as unexplained.
//
// published-reproduction: visl-printed-inputs-resident-default
// published-reproduction: visl-printed-inputs-resident-tgw10
// published-reproduction: visl-printed-inputs-commercial-default
// published-reproduction: visl-database-resident-default
// published-reproduction: visl-database-resident-tgw10
// published-reproduction: visl-database-commercial-default

interface ClassRecord {
  id: ClassId;
  reason: string;
  cells: Partial<Record<ComparisonId, Partial<Record<FixtureId, number>>>>;
  chemicals: string[];
}
interface Fixture {
  comparisons: Record<ComparisonId, Record<FixtureId | 'all', Counts>>;
  classes: ClassRecord[];
  cells: unknown[];
  unexplained: unknown[];
}
const fixture = exceptions as unknown as Fixture;

const outcomes = {} as Record<ComparisonId, Record<FixtureId, CellOutcome[]>>;
for (const c of COMPARISON_IDS) {
  outcomes[c] = {} as Record<FixtureId, CellOutcome[]>;
  for (const f of FIXTURE_IDS) outcomes[c][f] = runFixture(c, f);
}
const all = (c: ComparisonId): CellOutcome[] => FIXTURE_IDS.flatMap((f) => outcomes[c][f]);

const shown = (x: CellOutcome): unknown => ({
  comparison: x.comparison,
  fixture: x.fixture,
  chemical: x.name,
  quantity: x.quantity,
  printed: x.printed,
  computed: x.computed,
  ...(x.cls !== undefined ? { class: x.cls } : {}),
  ...(x.inputs !== undefined ? { inputs: x.inputs } : {}),
});

describe('VISL comparison: the printed data', () => {
  it('holds five chemicals in each of the three runs, with the settings each run states', () => {
    const settings = {
      'resident-default': ['Resident', '25', '0.1', '1e-06'],
      'resident-tgw10': ['Resident', '10', '1', '1e-05'],
      'commercial-default': ['Commercial', '25', '0.1', '1e-06'],
    } as const;
    for (const f of FIXTURE_IDS) {
      const q = RUNS[f].query;
      expect([q.scenario, q.tgw, q.hq, q.tr], f).toEqual(settings[f]);
      expect(
        RUNS[f].results.map((r) => r.cas),
        f,
      ).toEqual(['71-43-2', '79-01-6', '127-18-4', '91-20-3', '100-41-4']);
    }
  });

  it('prints every compared numeric output to three significant figures, the precision of the tolerance', () => {
    let checked = 0;
    for (const f of FIXTURE_IDS) {
      for (const r of RUNS[f].results) {
        for (const q of NUMERIC_QUANTITIES) {
          const cell = tableOf(r, q).find((c) => c.column.startsWith(COLUMN[q]))!;
          expect(printedDigits(cell.cell), `${f} ${r.name} ${q} ${cell.cell}`).toBe(3);
          expect(cell.cell, `${f} ${r.name} ${q}`).toMatch(/^\d\.\d{2}E[+-]\d{2}$/);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(FIXTURE_IDS.length * 5 * NUMERIC_QUANTITIES.length);
  });

  it('prints the attenuation factors the engine holds', () => {
    for (const f of FIXTURE_IDS) expect(printedFactors(RUNS[f]), f).toEqual(ENGINE_FACTORS);
  });

  it('reads the unit of the last printed digit and rejects an engine value outside half of it', () => {
    expect(printedUnit('3.60E-01')).toBeCloseTo(1e-3, 15);
    expect(printedUnit('1.59E+00')).toBeCloseTo(1e-2, 15);
    expect(printedUnit('353.15')).toBeCloseTo(1e-2, 15);
    expect(withinPrinted(0.3604, '3.60E-01')).toBe(true);
    expect(withinPrinted(0.36051, '3.60E-01')).toBe(false);
    expect(withinPrinted(0.35949, '3.60E-01')).toBe(false);
    expect(withinPrinted(4.06e8 * 1.0013, '4.06E+08')).toBe(false);
  });
});

describe('VISL comparison: counts', () => {
  it('compares every printed cell of the compared columns, in both comparisons', () => {
    for (const c of COMPARISON_IDS) {
      for (const f of FIXTURE_IDS) {
        // the cells that exist in the printed tables, counted from the data
        let printed = 0;
        for (const r of RUNS[f].results) {
          for (const q of quantitiesOf(c)) {
            printed += tableOf(r, q).filter((x) => x.column.startsWith(COLUMN[q])).length;
          }
        }
        expect(countOf(outcomes[c][f]).compared, `${c} ${f}`).toBe(printed);
      }
    }
  });

  it('compares the answers the engine has a criterion for, in both comparisons', () => {
    expect(
      [...ANSWER_QUANTITIES].filter((q) => !quantitiesOf('printed-inputs').includes(q)),
    ).toEqual(['mutagenic']);
    expect(quantitiesOf('database')).toHaveLength(
      NUMERIC_QUANTITIES.length + ANSWER_QUANTITIES.length,
    );
  });

  it('accounts for every compared cell exactly once', () => {
    for (const c of COMPARISON_IDS) {
      for (const f of FIXTURE_IDS) {
        const n = countOf(outcomes[c][f]);
        expect(n.reproduced + n.excepted + n.unexplained, `${c} ${f}`).toBe(n.compared);
      }
    }
  });

  it('matches the counts recorded in the fixture, per run and in total', () => {
    const counts = {} as Fixture['comparisons'];
    for (const c of COMPARISON_IDS) {
      counts[c] = { all: countOf(all(c)) } as Fixture['comparisons'][ComparisonId];
      for (const f of FIXTURE_IDS) counts[c][f] = countOf(outcomes[c][f]);
    }
    expect(counts).toEqual(fixture.comparisons);
  });
});

describe('VISL comparison: named exceptions', () => {
  const classes = (): ClassRecord[] =>
    CLASSES.map((id) => {
      const cells: ClassRecord['cells'] = {};
      const chemicals: string[] = [];
      for (const c of COMPARISON_IDS) {
        for (const f of FIXTURE_IDS) {
          const n = outcomes[c][f].filter((x) => x.cls === id);
          if (n.length === 0) continue;
          (cells[c] ??= {})[f] = n.length;
          for (const x of n) if (!chemicals.includes(x.name)) chemicals.push(x.name);
        }
      }
      return {
        id,
        reason: fixture.classes.find((k) => k.id === id)?.reason ?? '',
        cells,
        chemicals,
      };
    }).filter((k) => Object.keys(k.cells).length > 0);

  it('lists the classes of the fixture with their counts and chemicals', () => {
    expect(fixture.classes).toEqual(classes());
  });

  it('gives every class a reason, and keeps no class that excepts nothing', () => {
    for (const k of fixture.classes) {
      expect(k.reason.length, k.id).toBeGreaterThan(80);
      expect(Object.keys(k.cells).length, k.id).toBeGreaterThan(0);
    }
  });

  it('records every excepted cell with the printed and the computed value', () => {
    const excepted = COMPARISON_IDS.flatMap((c) => all(c).filter((x) => x.status === 'excepted'));
    expect(fixture.cells).toEqual(excepted.map(shown));
    for (const x of excepted) expect(x.cls, `${x.name} ${x.quantity}`).toBeDefined();
  });

  it('writes no em dash in the fixture', () => {
    expect(JSON.stringify(fixture)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('VISL comparison: unexplained cells', () => {
  it('prints every unexplained cell with the published and the computed value, and hides none', () => {
    const unexplained = COMPARISON_IDS.flatMap((c) =>
      all(c).filter((x) => x.status === 'unexplained'),
    );
    expect(fixture.unexplained).toEqual(unexplained.map(shown));
    for (const c of COMPARISON_IDS) {
      expect(all(c).filter((x) => x.status === 'unexplained').length, c).toBe(
        countOf(all(c)).unexplained,
      );
    }
  });
});

describe('VISL comparison: the rules can fail', () => {
  const benzene = RUNS['resident-default'].results[0]!;
  const tce = RUNS['resident-default'].results[1]!;
  const pce = RUNS['resident-default'].results[2]!;

  it('reports a numeric cell the engine misses as unexplained, not as an exception', () => {
    const c = contextOf('printed-inputs', 'resident-default', benzene);
    // a Henry's constant 5 percent high moves the groundwater level far outside any rounding of the inputs
    const off = { ...c, basis: { ...c.basis, hlc: c.basis.hlc * 1.05 } };
    expect(judge(off, 'cgw').status).toBe('unexplained');
    expect(judge(c, 'cgw').status).toBe('reproduced');
  });

  it('reproduces the trichloroethylene cancer level of the resident runs from the RSL equations, with no exception', () => {
    for (const f of ['resident-default', 'resident-tgw10'] as const) {
      const row = RUNS[f].results[1]!;
      expect(row.cas).toBe('79-01-6');
      for (const comparison of COMPARISON_IDS) {
        const c = contextOf(comparison, f, row);
        expect(c.basis.special, `${comparison} ${f}`).toBe('trichloroethylene');
        expect(judge(c, 'ciaC').status, `${comparison} ${f}`).toBe('reproduced');
      }
    }
  });

  it('does not reproduce a trichloroethylene cancer level the equations do not give, and does not except it', () => {
    const c = contextOf('printed-inputs', 'resident-default', tce);
    for (const wrong of ['1.00E-01', '9.00E-01']) {
      const other = JSON.parse(JSON.stringify(tce)) as typeof tce;
      other.visl.find((x) => x.column.startsWith(COLUMN.ciaC))!.cell = wrong;
      expect(judge({ ...c, result: other }, 'ciaC').status).toBe('unexplained');
    }
  });

  it('keeps the commercial trichloroethylene cancer level ordinary, as the receptor has no early-life segments', () => {
    const row = RUNS['commercial-default'].results[1]!;
    const c = contextOf('printed-inputs', 'commercial-default', row);
    expect(c.setting.receptor.mutagenStages).toBeUndefined();
    expect(judge(c, 'ciaC').status).toBe('reproduced');
  });

  it('excepts a rounding miss only when inputs that round to the printed ones reach the cell', () => {
    const c = contextOf('printed-inputs', 'resident-default', pce);
    expect(judge(c, 'cgw').cls).toBe('printed-input-rounding');
    const far = JSON.parse(JSON.stringify(pce)) as typeof pce;
    far.visl.find((x) => x.column.startsWith(COLUMN.cgw))!.cell = '5.90E+00';
    expect(judge({ ...c, result: far }, 'cgw').status).toBe('unexplained');
  });

  it('excepts the pure phase vapor at a cooler groundwater only when the 25 deg C value reproduces it', () => {
    const cool = RUNS['resident-tgw10'].results[0]!;
    const c = contextOf('printed-inputs', 'resident-tgw10', cool);
    expect(judge(c, 'cvp').cls).toBe('pure-phase-vapor-at-25');
    const other = JSON.parse(JSON.stringify(cool)) as typeof cool;
    other.visl.find((x) => x.column.startsWith(COLUMN.cvp))!.cell = '3.00E+08';
    expect(judge({ ...c, result: other }, 'cvp').status).toBe('unexplained');
  });

  it('names the database input whose difference explains a miss, and no other', () => {
    const cool = RUNS['resident-tgw10'].results[1]!;
    const c = contextOf('database', 'resident-tgw10', cool);
    const o = judge(c, 'cgw');
    expect(o.cls).toBe('database-input-differs');
    expect(o.inputs).toEqual(['tcK']);
  });

  it('reproduces the groundwater level and the maximum vapor from the Henry correction at 10 deg C', () => {
    // the cells that test the temperature correction itself: H prime, Cgw and Chc at 10 deg C, from the
    // printed inputs, are reproduced or excepted for input rounding only
    for (const x of outcomes['printed-inputs']['resident-tgw10'].filter((y) =>
      ['hPrime', 'cgw', 'chc'].includes(y.quantity),
    )) {
      expect(['reproduced', 'excepted'], `${x.name} ${x.quantity}`).toContain(x.status);
      if (x.status === 'excepted')
        expect(x.cls, `${x.name} ${x.quantity}`).toBe('printed-input-rounding');
    }
    expect(
      outcomes['printed-inputs']['resident-tgw10'].filter(
        (y) => y.quantity === 'hPrime' && y.status === 'reproduced',
      ).length,
    ).toBeGreaterThan(2);
  });
});
