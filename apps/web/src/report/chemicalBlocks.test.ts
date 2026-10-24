import { describe, expect, it } from 'vitest';
import type { Slots } from './chemicalBlocks';
import {
  householdBlocks,
  methodName,
  plantsBlocks,
  saturatedBlocks,
  surfaceWaterBlocks,
  transportBlocks,
  vadoseBlocks,
  vaporBlocks,
} from './chemicalBlocks';
import {
  DEFAULT_FORM as SATURATED_DEFAULT,
  toScenario as saturatedScenario,
} from '../saturated/form';
import { DEFAULT_FORM as VADOSE_DEFAULT, toScenario as vadoseScenario } from '../vadose/form';
import { transportRunInputs } from '../transport/runInputs';

const YR = 365.25 * 86400;
const NAMES: Record<string, string> = {
  '71-43-2': 'Benzene',
  '1634-04-4': 'Methyl tert-butyl ether',
};
const nameOf = (id: string): string => NAMES[id] ?? id;

/** Slots from a plain object of feed key to chemical id to value. */
const slotsOf =
  (held: Record<string, Record<string, unknown>>): Slots =>
  <T>(key: string) =>
    new Map(Object.entries(held[key] ?? {})) as ReadonlyMap<string, T>;

const series = (peak: number) => ({
  times: [0, YR, 2 * YR, 3 * YR],
  values: [0, peak / 2, peak, peak / 4],
});

describe('methodName', () => {
  it('names a registered method, and says so for an entered value', () => {
    expect(methodName('groundwater.wexler1992')).toMatch(/wexler/i);
    expect(methodName('entered')).toBe('entered by the user');
    expect(methodName(undefined)).toBe('entered by the user');
  });
});

describe('transportBlocks', () => {
  const held = {
    well: {
      '71-43-2': {
        method: 'modern',
        label: 'Receptor well, modern, 15 years',
        chemicalId: '71-43-2',
        ...series(2e-3),
      },
      '1634-04-4': {
        method: 'legacy',
        label: 'Receptor well, legacy, 15 years',
        chemicalId: '1634-04-4',
        ...series(8e-3),
      },
    },
  };

  it('prints one block per chemical sent, named by the chemical and not by its id', () => {
    const blocks = transportBlocks(slotsOf(held), nameOf);
    expect(blocks.map((b) => b.name)).toEqual(['Benzene', 'Methyl tert-butyl ether']);
    for (const b of blocks) {
      // everything the report prints: the name, the lines, the inputs, and each table's label, headers and cells
      const printed = JSON.stringify([
        b.name,
        b.sent,
        b.inputs,
        b.notes,
        b.tables.map((t) => [t.label, t.columns, t.rows]),
      ]);
      expect(printed).not.toMatch(/71-43-2|1634-04-4/);
    }
  });

  it("gives each chemical's own well concentration series in mg/L and years, with the peak", () => {
    const [benzene, mtbe] = transportBlocks(slotsOf(held), nameOf);
    const summary = benzene!.tables.find((t) => t.name.startsWith('transport-well-summary'))!;
    expect(summary.rows[0]).toMatchObject({ peak: 2, at: 2, last: 0.5 });
    const rows = benzene!.tables.find((t) => t.name.startsWith('transport-well-series'))!.rows;
    expect(rows).toHaveLength(4);
    expect(rows[2]).toEqual({ time: 2, concentration: 2 });
    const mtbeSummary = mtbe!.tables.find((t) => t.name.startsWith('transport-well-summary'))!;
    expect(mtbeSummary.rows[0]).toMatchObject({ peak: 8 });
    // table names differ per chemical, so the report can key them
    expect(benzene!.tables[0]!.name).not.toBe(mtbe!.tables[0]!.name);
  });

  it('names the inputs of a plume run sent to the surface water screen, in screen units', () => {
    const bank = {
      label: 'Groundwater transport run, 15 years',
      chemicalId: '71-43-2',
      scenario: {
        velocity: 37.9 / YR,
        porosity: 0.25,
        retardation: 2,
        decayRate: Math.LN2 / (10 * YR),
        alphaL: 10,
        alphaT: 1,
        alphaV: 0.1,
        srcLength: 15,
        srcWidth: 20,
        srcDepth: 3,
        c0: 0.01,
        massRate: 1e-9,
        receptor: { x: 100, y: 0 },
        time: 15 * YR,
      },
    };
    const [b] = transportBlocks(slotsOf({ bank: { '71-43-2': bank } }), nameOf);
    const value = (label: string) => b!.inputs.find((i) => i.label === label)?.value;
    expect(value('Seepage velocity')).toBe('37.9 m/yr');
    expect(value('Decay half-life')).toBe('10 yr');
    expect(value('Source concentration')).toBe('10 mg/L');
    expect(value('Receptor distance downgradient')).toBe('100 m');
    expect(value('Evaluation time')).toBe('15 yr');
    expect(b!.notes.join(' ')).toMatch(/No well concentration was sent/);
  });

  it('names a run made with the chemical typed by hand without inventing an id', () => {
    const [b] = transportBlocks(
      slotsOf({ well: { '': { method: 'modern', label: 'x', ...series(1e-3) } } }),
      nameOf,
    );
    expect(b!.name).toMatch(/entered by hand/i);
  });

  it('has no block when nothing was sent', () => {
    expect(transportBlocks(slotsOf({}), nameOf)).toEqual([]);
  });
});

describe('vaporBlocks', () => {
  it('prints the indoor and outdoor air a chemical was sent with, in mg/m3', () => {
    const [b] = vaporBlocks(
      slotsOf({
        vaporRisk: {
          '71-43-2': {
            chemicalId: '71-43-2',
            label: 'Benzene, vapor run',
            indoor: { kind: 'series', series: series(3e-6), origin: 'vapor.je-1991' },
            outdoor: { kind: 'constant', value: 2e-9, origin: 'outdoorAir.box' },
          },
        },
      }),
      nameOf,
    );
    expect(b!.name).toBe('Benzene');
    const rows = b!.tables[0]!.rows;
    expect(rows[0]).toMatchObject({
      where: 'Indoor air',
      form: 'time series',
      concentration: 3,
      at: 2,
    });
    expect(rows[1]).toMatchObject({ where: 'Outdoor air', form: 'constant', concentration: 0.002 });
    expect(String(rows[0]!['method'])).not.toMatch(/vapor\.je-1991/);
  });
});

describe('surfaceWaterBlocks', () => {
  it('prints the surface water series sent, with the method named', () => {
    const [b] = surfaceWaterBlocks(
      slotsOf({
        surfaceWater: {
          '71-43-2': {
            method: 'mass-discharge',
            origin: 'surfaceWater.mass-discharge',
            label: 'Modern mass-discharge surface water, 10 years',
            chemicalId: '71-43-2',
            ...series(1e-5),
          },
        },
      }),
      nameOf,
    );
    expect(b!.name).toBe('Benzene');
    expect(b!.inputs[0]).toEqual({ label: 'Method sent', value: 'modern mass-discharge method' });
    expect(
      b!.tables.find((t) => t.name.startsWith('surface-water-summary'))!.rows[0],
    ).toMatchObject({
      peak: 0.01,
    });
  });
});

describe('householdBlocks and plantsBlocks', () => {
  it('prints the household air sent for each pathway with the method that made it', () => {
    const [b] = householdBlocks(
      slotsOf({
        household: {
          '71-43-2': {
            chemicalId: '71-43-2',
            label: 'Benzene, household run',
            bathroomAir: { kind: 'constant', value: 1e-6, origin: 'shower.little-1992' },
            coefficients: {},
            methods: { bathroomAir: 'shower.little-1992' },
          },
        },
      }),
      nameOf,
    );
    expect(b!.tables[0]!.rows).toHaveLength(1);
    expect(b!.tables[0]!.rows[0]).toMatchObject({
      where: 'Shower or bathroom air',
      concentration: 1,
    });
  });

  it('prints the produce factors and intakes sent', () => {
    const [b] = plantsBlocks(
      slotsOf({
        produce: {
          '71-43-2': {
            chemicalId: '71-43-2',
            label: 'Benzene',
            method: 'plantUptake.hhrap-2005',
            factors: { root: 0.02 },
            intakes: { root: { gPerKgDay: 1.5, fractionHomegrown: 0.4 } },
            intakeLabel: 'user entered',
          },
        },
      }),
      nameOf,
    );
    expect(b!.tables[0]!.rows[0]).toMatchObject({
      produce: 'Root produce',
      factor: 0.02,
      intake: 1.5,
      homegrown: 0.4,
    });
    expect(b!.inputs.find((i) => i.label === 'Intake')!.value).toBe('user entered');
  });
});

describe('vadoseBlocks and saturatedBlocks', () => {
  it('repeats a sent vadose run for its chemical and prints the inputs it ran with', () => {
    const parsed = vadoseScenario({ ...VADOSE_DEFAULT, dispersivityBasis: 'regression' });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const [b] = vadoseBlocks(
      slotsOf({
        vadose: {
          '71-43-2': {
            chemicalId: '71-43-2',
            method: 'modern',
            label: 'Vadose leaching run',
            scenario: parsed.scenario,
          },
        },
      }),
      nameOf,
    );
    expect(b!.name).toBe('Benzene');
    expect(b!.inputs.find((i) => i.label === 'Run length')!.value).toBe('10 yr');
    expect(b!.inputs.find((i) => i.label === 'Source length')!.value).toBe('10 m');
    expect(b!.notes).toEqual([
      'The legacy method is printed as a sensitivity and is not the run the groundwater screen used; the modern method was sent.',
    ]);
    // the sent method's tables first, the other method's as a sensitivity
    expect(b!.tables.map((t) => t.name)).toEqual([
      'vadose-results-71-43-2-sent',
      'vadose-time-series-71-43-2-sent',
      'vadose-results-71-43-2-sensitivity',
      'vadose-time-series-71-43-2-sensitivity',
    ]);
    expect(b!.tables[1]!.rows.length).toBeGreaterThan(0);
    expect(b!.tables[0]!.label).toContain('Benzene');
    const methodsOf = (t: { rows: readonly { method?: unknown }[] }) => [
      ...new Set(t.rows.map((r) => r.method)),
    ];
    expect(methodsOf(b!.tables[0]!)).toEqual(['vadose.layered']);
    expect(methodsOf(b!.tables[2]!)).toEqual(['vadose.vadsat']);
    expect(b!.tables[0]!.label).toMatch(/modern method, the one the groundwater screen used/);
    expect(b!.tables[2]!.label).toMatch(
      /legacy method, a sensitivity: not the run the groundwater screen used/,
    );
  });

  it('repeats a sent saturated source run and prints its inputs', () => {
    const parsed = saturatedScenario(SATURATED_DEFAULT);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const [b] = saturatedBlocks(
      slotsOf({
        saturated: {
          '71-43-2': {
            chemicalId: '71-43-2',
            method: 'legacy',
            label: 'Saturated source run',
            input: parsed.scenario.input,
          },
        },
      }),
      nameOf,
    );
    expect(b!.name).toBe('Benzene');
    expect(b!.inputs.find((i) => i.label === 'Aquifer conductivity')!.value).toBe('5 m/d');
    expect(b!.inputs.find((i) => i.label === 'Horizon')!.value).toBe('10 yr');
    // sent: legacy; the modern run is the sensitivity
    expect(b!.tables.map((t) => t.name)).toEqual([
      'saturated-results-71-43-2-sent',
      'saturated-time-series-71-43-2-sent',
      'saturated-results-71-43-2-sensitivity',
      'saturated-time-series-71-43-2-sensitivity',
    ]);
    expect(b!.tables[0]!.label).toMatch(/legacy method, the one the groundwater screen used/);
    expect(b!.tables[2]!.label).toMatch(/modern method, a sensitivity/);
  });
});

describe('recorded inputs in the blocks', () => {
  const rows = (c: string) => [
    { label: 'Source concentration', value: `${c} mg/L` },
    { label: 'Longitudinal dispersivity', value: '10 m' },
  ];
  const value = (b: { inputs: { label: string; value: string }[] }, label: string) =>
    b.inputs.find((i) => i.label === label)?.value;
  const noMarker = (notes: string[]) => notes.filter((n) => /not recorded/.test(n));

  describe('transport, two chemicals sent with different source concentrations', () => {
    const held = {
      well: {
        '71-43-2': {
          method: 'modern',
          label: 'Receptor well, modern, 15 years',
          chemicalId: '71-43-2',
          runInputs: rows('10'),
          ...series(6.17e-3),
        },
        '1634-04-4': {
          method: 'modern',
          label: 'Receptor well, modern, 15 years',
          chemicalId: '1634-04-4',
          runInputs: rows('40'),
          ...series(9e-3),
        },
      },
    };

    it("prints each chemical's own source concentration beside its own well series", () => {
      const [benzene, mtbe] = transportBlocks(slotsOf(held), nameOf);
      expect(value(benzene!, 'Source concentration')).toBe('10 mg/L');
      expect(value(mtbe!, 'Source concentration')).toBe('40 mg/L');
      expect(value(benzene!, 'Longitudinal dispersivity')).toBe('10 m');
      // the method row stays, and neither block carries the other's value
      expect(value(benzene!, 'Method sent')).toBeTruthy();
      expect(JSON.stringify(benzene!.inputs)).not.toMatch(/40 mg\/L/);
      expect(JSON.stringify(mtbe!.inputs)).not.toMatch(/10 mg\/L/);
      expect(noMarker(benzene!.notes)).toEqual([]);
      expect(benzene!.tables[0]!.rows[0]).toMatchObject({ peak: 6.17 });
    });

    it('prints the plume run rows once when the well run and the plume run are the same run', () => {
      const bank = {
        label: 'Groundwater transport run, 15 years',
        chemicalId: '71-43-2',
        scenario: { c0: 0.01, alphaL: 10, time: 15 * YR },
      };
      const [b] = transportBlocks(
        slotsOf({
          well: { '71-43-2': held.well['71-43-2'] },
          bank: { '71-43-2': bank },
        }),
        nameOf,
      );
      // the bank scenario above gives other rows than the well's, so both print and each names its run
      expect(b!.inputs.filter((i) => i.label.startsWith('Source concentration'))).toEqual([
        { label: 'Source concentration (well run)', value: '10 mg/L' },
        { label: 'Source concentration (surface water plume run)', value: '10 mg/L' },
      ]);
      const same = transportBlocks(
        slotsOf({
          well: {
            '71-43-2': {
              ...held.well['71-43-2'],
              runInputs: transportRunInputs(bank.scenario),
            },
          },
          bank: { '71-43-2': bank },
        }),
        nameOf,
      )[0]!;
      expect(same.inputs.filter((i) => i.label === 'Source concentration')).toHaveLength(1);
    });

    it('says the inputs were not recorded for a well result sent before they were, and how to record them', () => {
      const old = { ...held.well['71-43-2'] } as Record<string, unknown>;
      delete old['runInputs'];
      const [b] = transportBlocks(slotsOf({ well: { '71-43-2': old } }), nameOf);
      expect(b!.inputs.map((i) => i.label)).toEqual(['Method sent']);
      const note = noMarker(b!.notes)[0] ?? '';
      expect(note).toMatch(/not recorded/);
      expect(note).toMatch(/send it again from the groundwater screen/);
    });

    it('does not trust a malformed value: it reads as not recorded', () => {
      const [b] = transportBlocks(
        slotsOf({ well: { '71-43-2': { ...held.well['71-43-2'], runInputs: 'broken' } } }),
        nameOf,
      );
      expect(noMarker(b!.notes)).toHaveLength(1);
    });
  });

  it('vapor: prints the recorded rows, and the note for a feed without them', () => {
    const feed = {
      chemicalId: '71-43-2',
      label: 'Benzene, legacy',
      indoor: { kind: 'constant', value: 1e-6, origin: 'vapor.je-1991' },
    };
    const [withRows] = vaporBlocks(
      slotsOf({ vaporRisk: { '71-43-2': { ...feed, runInputs: rows('1000') } } }),
      nameOf,
    );
    expect(value(withRows!, 'Source concentration')).toBe('1000 mg/L');
    expect(noMarker(withRows!.notes)).toEqual([]);
    const [without] = vaporBlocks(slotsOf({ vaporRisk: { '71-43-2': feed } }), nameOf);
    expect(without!.inputs).toEqual([]);
    expect(noMarker(without!.notes)[0]).toMatch(/send it again from the vapor intrusion screen/);
  });

  it('surface water: prints the recorded rows after the method, and the note for a feed without them', () => {
    const feed = {
      method: 'well-mixed',
      origin: 'surfaceWater.well-mixed',
      label: 'sw',
      chemicalId: '71-43-2',
      ...series(1e-3),
    };
    const [withRows] = surfaceWaterBlocks(
      slotsOf({ surfaceWater: { '71-43-2': { ...feed, runInputs: rows('5') } } }),
      nameOf,
    );
    expect(withRows!.inputs.map((i) => i.label)).toEqual([
      'Method sent',
      'Source concentration',
      'Longitudinal dispersivity',
    ]);
    const [without] = surfaceWaterBlocks(slotsOf({ surfaceWater: { '71-43-2': feed } }), nameOf);
    expect(without!.inputs.map((i) => i.label)).toEqual(['Method sent']);
    expect(noMarker(without!.notes)[0]).toMatch(/send it again from the surface water screen/);
  });

  it('household: prints the recorded rows (the block listed none before), and the note without them', () => {
    const feed = {
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      bathroomAir: { kind: 'constant', value: 1e-6, origin: 'shower.little-1992' },
      coefficients: {},
      methods: { bathroomAir: 'shower.little-1992' },
    };
    const [withRows] = householdBlocks(
      slotsOf({ household: { '71-43-2': { ...feed, runInputs: rows('0.5') } } }),
      nameOf,
    );
    expect(value(withRows!, 'Source concentration')).toBe('0.5 mg/L');
    const [without] = householdBlocks(slotsOf({ household: { '71-43-2': feed } }), nameOf);
    expect(without!.inputs).toEqual([]);
    expect(noMarker(without!.notes)[0]).toMatch(/send it again from the household screen/);
  });

  it('plants: prints the recorded rows after the method and intake, and the note without them', () => {
    const feed = {
      chemicalId: '71-43-2',
      label: 'Benzene, plants',
      method: 'plantUptake.hhrap-2005',
      factors: { root: 0.1 },
      intakes: { root: { gPerKgDay: 1, fractionHomegrown: 0.5 } },
      intakeLabel: 'user entered',
    };
    const [withRows] = plantsBlocks(
      slotsOf({ produce: { '71-43-2': { ...feed, runInputs: rows('10') } } }),
      nameOf,
    );
    expect(withRows!.inputs.map((i) => i.label)).toEqual([
      'Plant uptake method',
      'Intake',
      'Source concentration',
      'Longitudinal dispersivity',
    ]);
    const [without] = plantsBlocks(slotsOf({ produce: { '71-43-2': feed } }), nameOf);
    expect(noMarker(without!.notes)[0]).toMatch(/send it again from the plants and ecology screen/);
  });
});
