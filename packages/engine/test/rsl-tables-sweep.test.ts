import { describe, expect, it } from 'vitest';
import {
  CLASS_IDS,
  SWEEP_IDS,
  engineAirLevel,
  engineCoef,
  engineLevel,
  levels,
  rslPef,
  rslVfStatus,
  runRslSweep,
  soilToAirFactor,
  type ClassId,
  type PathwayName,
  type SweepCounts,
  type SoilInhalationCounts,
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
  soilInhalation: SoilInhalationCounts;
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

describe('RSL screening-level sweep: the cells once left unexplained', () => {
  it('reproduces PCB 105 resident noncancer soil inhalation from the TEF-applied reference concentration', () => {
    // 2,3,7,8-TCDD RfCi 4E-8 over the guide's TEF of 3E-5 is 1.3333E-3, printed 1.33E-3; the rounded value gave 833.3
    const pcb105 = levels.chemicals.find((c) => c.id === '32598-14-4')!;
    const cell = pcb105.values['soil-resident.inhalation.noncancer']!;
    expect(cell.value).toBe(840);
    const computed = engineLevel(
      engineCoef('soil-resident', 'inhalation', pcb105.id, { dermal: true, inhalation: true }),
      'noncancer',
      'mg/kg',
    );
    expect(computed).toBeGreaterThan(835);
    expect(withinHalfUnit(computed as number, 840)).toBe(true);
    expect(result.unexplained.map((u) => u.chemical)).not.toContain(pcb105.id);
  });

  it('excepts the four Aroclor tap water total cancer cells only through the printed unit risk interval', () => {
    const cls = result.classes['iur-printed-three-figures'];
    expect(cls.cells).toEqual({ tapwater: 4 });
    expect(cls.chemicals).toEqual(['Aroclor 1242', 'Aroclor 1248', 'Aroclor 1254', 'Aroclor 1260']);
    const ch = levels.chemicals.find((c) => c.name === 'Aroclor 1242')!;
    const published = ch.values['tapwater.total.cancer']!.value;
    expect(published).toBe(0.0078);
    const at = (iurFactor: number): number =>
      engineLevel(
        engineCoef('tapwater', 'total', ch.id, { dermal: false, inhalation: true, iurFactor }),
        'cancer',
        'ug/L',
      ) as number;
    // at the printed unit risk the total misses by 0.0000020; at the top of its rounding interval it prints 0.0078
    expect(withinHalfUnit(at(1), published)).toBe(false);
    expect(withinHalfUnit(at(5.715 / 5.71), published)).toBe(true);
    expect(withinHalfUnit(at(5.7125 / 5.71), published)).toBe(true);
    expect(withinHalfUnit(at(5.711 / 5.71), published)).toBe(false);
  });

  it('leaves n-nonane industrial noncancer soil total unexplained and visible', () => {
    expect(result.unexplained.map((u) => u.name)).toEqual(['Nonane, n-']);
    expect(result.unexplained[0]).toMatchObject({ published: 72, computed: 72.5 });
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
    // the cancer cells the equations change: tap water (four pathways), resident soil ingestion, inhalation and
    // total, resident air
    const columns = [
      'tapwater.ingestion.cancer',
      'tapwater.dermal.cancer',
      'tapwater.inhalation.cancer',
      'tapwater.total.cancer',
      'soil-resident.ingestion.cancer',
      'soil-resident.inhalation.cancer',
      'soil-resident.total.cancer',
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
    // the soil inhalation cells and the soil totals that include them reproduce as well (wave U)
    expect(fixture.classes.map((c) => c.id)).not.toContain('special-case-equations');
    expect(CLASS_IDS as readonly string[]).not.toContain('special-case-equations');
    for (const u of result.unexplained) {
      expect(['Trichloroethylene', 'Vinyl Chloride'], u.name).not.toContain(u.name);
    }
  });
});

describe('RSL screening-level sweep: soil inhalation and the totals that include it', () => {
  const soilSweeps = ['soil-resident', 'soil-industrial'] as const;

  it('keeps no exception class for soil inhalation', () => {
    expect(CLASS_IDS as readonly string[]).not.toContain('soil-inhalation-not-computed');
    expect(CLASS_IDS as readonly string[]).not.toContain('soil-total-with-inhalation-not-computed');
    expect(fixture.classes.map((c) => c.id)).not.toContain('soil-inhalation-not-computed');
  });

  it('compares every printed soil inhalation cell and every soil total that includes one', () => {
    // the counts come from the published data, not from a typed number
    for (const sweep of soilSweeps) {
      const inhalationCols = levels.columns.filter((c) => c.id.startsWith(`${sweep}.inhalation.`));
      const inhalation = inhalationCols.reduce((n, c) => n + c.count, 0);
      let totals = 0;
      for (const ch of levels.chemicals) {
        for (const e of ['cancer', 'noncancer']) {
          if (
            ch.values[`${sweep}.total.${e}`] !== undefined &&
            ch.values[`${sweep}.inhalation.${e}`] !== undefined
          ) {
            totals += 1;
          }
        }
      }
      expect(inhalation, sweep).toBeGreaterThan(0);
      expect(result.soilInhalation[sweep].inhalation.compared, sweep).toBe(inhalation);
      expect(result.soilInhalation[sweep].totalWithInhalation.compared, sweep).toBe(totals);
    }
  });

  it('records the reproduced counts of the soil inhalation cells in the fixture', () => {
    expect(result.soilInhalation).toEqual(fixture.soilInhalation);
    for (const sweep of soilSweeps) {
      for (const part of ['inhalation', 'totalWithInhalation'] as const) {
        const c = result.soilInhalation[sweep][part];
        expect(c.reproduced + c.excepted + c.unexplained, `${sweep} ${part}`).toBe(c.compared);
      }
    }
  });
});

describe('RSL screening-level sweep: soil inhalation classes and the factors', () => {
  const soilSweeps = ['soil-resident', 'soil-industrial'] as const;
  const missingChemicals = (): string[] =>
    levels.chemicals.filter((c) => rslVfStatus(c.id).kind === 'missing-input').map((c) => c.id);

  it('names a volatile chemical with neither Koc nor Kd the only reason the volatilization factor is missing', () => {
    // every chemical the class holds lacks both partition inputs, and every such chemical with a printed soil
    // inhalation cell is in the class (identified from the data, not from a list)
    const inClass = new Set<string>();
    for (const sweep of soilSweeps) {
      for (const id of [
        'soil-inhalation-vf-input-missing',
        'soil-total-vf-input-missing',
      ] as const) {
        const cells = result.classes[id].cells[sweep] ?? 0;
        expect(cells, `${sweep} ${id}`).toBeGreaterThan(0);
      }
    }
    for (const ch of levels.chemicals) {
      const st = rslVfStatus(ch.id);
      if (st.kind !== 'missing-input') continue;
      const printed = soilSweeps.some(
        (m) =>
          ch.values[`${m}.inhalation.cancer`] !== undefined ||
          ch.values[`${m}.inhalation.noncancer`] !== undefined,
      );
      if (!printed) continue;
      expect(st.missing, ch.name).toContain('Koc and Kd');
      inClass.add(ch.name);
    }
    expect([...inClass].sort()).toEqual(
      [
        ...new Set([
          ...result.classes['soil-inhalation-vf-input-missing'].chemicals,
          ...result.classes['soil-total-vf-input-missing'].chemicals,
        ]),
      ].sort(),
    );
    expect(missingChemicals().length).toBeGreaterThanOrEqual(inClass.size);
  });

  it('counts the class cells from the data, one per printed cell of those chemicals', () => {
    const missing = new Set(missingChemicals());
    for (const sweep of soilSweeps) {
      let inhalation = 0;
      let totals = 0;
      for (const ch of levels.chemicals) {
        if (!missing.has(ch.id)) continue;
        for (const e of ['cancer', 'noncancer']) {
          if (ch.values[`${sweep}.inhalation.${e}`] === undefined) continue;
          inhalation += 1;
          if (ch.values[`${sweep}.total.${e}`] !== undefined) totals += 1;
        }
      }
      expect(result.classes['soil-inhalation-vf-input-missing'].cells[sweep], sweep).toBe(
        inhalation,
      );
      expect(result.classes['soil-total-vf-input-missing'].cells[sweep], sweep).toBe(totals);
    }
  });

  it('reproduces every class cell with the particulate-only level, which is what the sweep checks before classing it', () => {
    for (const ch of levels.chemicals.filter((c) => rslVfStatus(c.id).kind === 'missing-input')) {
      for (const sweep of soilSweeps) {
        for (const e of ['cancer', 'noncancer'] as const) {
          const cell = ch.values[`${sweep}.inhalation.${e}`];
          if (cell === undefined) continue;
          const col = levels.columns.find((c) => c.id === `${sweep}.inhalation.${e}`)!;
          const level = engineLevel(
            engineCoef(sweep, 'inhalation', ch.id, {
              dermal: false,
              inhalation: true,
              particulateOnly: true,
            }),
            e,
            col.units,
          );
          expect(typeof level, `${ch.name} ${sweep} ${e}`).toBe('number');
          expect(withinHalfUnit(level as number, cell.value), `${ch.name} ${sweep} ${e}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('reproduces the particulate emission factor of the guide, 1.36E9 m3/kg', () => {
    expect(Number(rslPef().toPrecision(3))).toBe(1.36e9);
  });

  it('leaves the particulate share of the vinyl chloride term, which the guide equation omits, below one part in 1e5', () => {
    const vc = levels.chemicals.find((c) => c.name === 'Vinyl Chloride')!;
    const st = rslVfStatus(vc.id);
    expect(st.kind).toBe('vf');
    const f = soilToAirFactor(vc.id)!;
    const pefShare = 1 / rslPef() / f;
    expect(pefShare).toBeLessThan(1e-5);
  });

  it('matches a hand calculation of benzene: the apparent diffusivity, the volatilization factor and the levels', () => {
    // benzene (RSL parameter sheet values as shipped) with the guide equations written out by hand
    const H = 0.22690106295994;
    const Dia = 0.08953403951206; // cm2/s
    const Diw = 1.026318746e-5; // cm2/s
    const koc = 145.8; // L/kg
    const iur = 7.8e-6; // per ug/m3
    const rfc = 0.03; // mg/m3
    const rhoB = 1.5;
    const n = 1 - rhoB / 2.65;
    const thetaW = 0.15;
    const thetaA = n - thetaW;
    const kd = koc * 0.006; // cm3/g, equal to L/kg
    const da =
      (thetaA ** (10 / 3) * Dia * H + thetaW ** (10 / 3) * Diw) /
      n ** 2 /
      (rhoB * kd + thetaW + thetaA * H);
    const vf = (68.18 * Math.sqrt(3.14 * da * 8.2e8) * 1e-4) / (2 * rhoB * da);
    const xx = (0.886 * 11.32) / 4.69;
    expect(xx).toBeGreaterThan(2);
    const pef = (93.77 * 3600) / (0.036 * 0.5 * (4.69 / 11.32) ** 3 * 0.194);
    const f = 1 / vf + 1 / pef;

    const benzene = levels.chemicals.find((c) => c.name === 'Benzene')!;
    expect(soilToAirFactor(benzene.id)! / f).toBeCloseTo(1, 12);
    const st = rslVfStatus(benzene.id);
    expect(st.kind).toBe('vf');
    if (st.kind === 'vf') expect(st.vf / vf).toBeCloseTo(1, 12);
    expect(vf).toBeGreaterThan(1e3);
    expect(vf).toBeLessThan(1e4);

    const hand = {
      residentCancer: (1e-6 * 365 * 70) / (iur * 1000 * 350 * 26 * f),
      residentNoncancer: (1 * 365 * 6) / ((1 / rfc) * 350 * 6 * f),
      industrialCancer: (1e-6 * 365 * 70) / (iur * 1000 * 250 * 25 * (8 / 24) * f),
      industrialNoncancer: (1 * 365 * 25) / ((1 / rfc) * 250 * 25 * (8 / 24) * f),
    };
    const columns = {
      residentCancer: ['soil-resident', 'cancer'],
      residentNoncancer: ['soil-resident', 'noncancer'],
      industrialCancer: ['soil-industrial', 'cancer'],
      industrialNoncancer: ['soil-industrial', 'noncancer'],
    } as const;
    for (const [key, [medium, endpoint]] of Object.entries(columns)) {
      const col = levels.columns.find((c) => c.id === `${medium}.inhalation.${endpoint}`)!;
      const engine = engineLevel(
        engineCoef(medium, 'inhalation', benzene.id, { dermal: false, inhalation: true }),
        endpoint,
        col.units,
      ) as number;
      const h = hand[key as keyof typeof hand];
      expect(engine / h, key).toBeCloseTo(1, 9);
      // the hand value reproduces the printed cell by the sweep's rule
      expect(withinHalfUnit(h, benzene.values[col.id]!.value), key).toBe(true);
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
