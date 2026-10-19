import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM as TRANSPORT_DEFAULT } from '../transport/form';
import * as transport from '../transport/project';
import { DEFAULT_FORM as VADOSE_DEFAULT } from '../vadose/form';
import * as vadose from '../vadose/project';
import { DEFAULT_FORM as SATURATED_DEFAULT } from '../saturated/form';
import * as saturated from '../saturated/project';
import { DEFAULT_FORM as VAPOR_DEFAULT } from '../vapor/form';
import { DEFAULT_OUTDOOR } from '../vapor/outdoor';
import { DEFAULT_PVI } from '../vapor/screening';
import * as vapor from '../vapor/project';
import { DEFAULT_FORM as SW_DEFAULT, LAKE_FORM } from '../surfaceWater/inputs';
import * as surfaceWater from '../surfaceWater/project';
import { defaultForm as riskDefault, defaultReceptor, type ChemicalRow } from '../risk/form';
import * as risk from '../risk/project';
import { defaultCleanupForm } from '../cleanup/form';
import * as cleanup from '../cleanup/project';
import { unknownKeyPaths } from './merge';

const json = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

const chemical: ChemicalRow = {
  id: '71-43-2',
  name: 'Benzene',
  dermalForm: 'organic',
  conc: { soil: '12', groundwater: '0.4' },
  groundwaterFromWell: true,
  indoorFromVapor: false,
  outdoorFromVapor: true,
  surfaceWaterFromModel: false,
  bathroomFromHousehold: true,
  indoorFromHousehold: true,
  outdoorFromHousehold: 'sprinkler',
  produceFromPlantsEco: true,
};

interface Case<S> {
  name: string;
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } };
  toProject: (s: S) => unknown;
  fromProject: (p: never) => S;
  states: S[];
}

function riskState() {
  const f = riskDefault();
  return {
    ...f,
    chemicals: [chemical],
    b: { ...defaultReceptor('child'), produce: true },
    additive: true,
    startYr: '5',
  };
}

const cases: Case<unknown>[] = [
  {
    name: 'transport',
    schema: transport.transportProjectSchema,
    toProject: transport.toProject as never,
    fromProject: transport.fromProject as never,
    states: [
      { form: TRANSPORT_DEFAULT, method: 'modern' },
      {
        form: { ...TRANSPORT_DEFAULT, loading: 'steps', K: '1e-3', width: '40', screen: true },
        method: 'domenico',
      },
    ],
  },
  {
    name: 'vadose',
    schema: vadose.vadoseProjectSchema,
    toProject: vadose.toProject as never,
    fromProject: vadose.fromProject as never,
    states: [
      { form: VADOSE_DEFAULT },
      {
        form: { ...VADOSE_DEFAULT, hydraulicModel: 'brooksCorey1964', below: [], measure: 'flux' },
      },
    ],
  },
  {
    name: 'saturated',
    schema: saturated.saturatedProjectSchema,
    toProject: saturated.toProject as never,
    fromProject: saturated.fromProject as never,
    states: [
      { form: SATURATED_DEFAULT, method: 'legacy' },
      { form: { ...SATURATED_DEFAULT, schedule: 'seasonal', method: 'modern' }, method: 'modern' },
    ],
  },
  {
    name: 'vapor',
    schema: vapor.vaporProjectSchema,
    toProject: vapor.toProject as never,
    fromProject: vapor.fromProject as never,
    states: [
      {
        form: VAPOR_DEFAULT,
        outdoor: DEFAULT_OUTDOOR,
        af: { medium: 'groundwater', depthBelowFoundation: 0, preferential: false },
        pvi: DEFAULT_PVI,
        choice: 'entered',
      },
      {
        form: {
          ...VAPOR_DEFAULT,
          source: 'groundwater',
          foundation: 'crawlDirt',
          method: 'modern',
        },
        outdoor: { ...DEFAULT_OUTDOOR, windSpeed: '4' },
        af: { medium: 'subSlabSoilGas', depthBelowFoundation: 2.5, preferential: true },
        pvi: { ...DEFAULT_PVI, sourceType: 'lnapl', fuel: 'weathered', ethanol: '0.1' },
        choice: 'waterTable',
      },
    ],
  },
  {
    name: 'surfaceWater',
    schema: surfaceWater.surfaceWaterProjectSchema,
    toProject: surfaceWater.toProject as never,
    fromProject: surfaceWater.fromProject as never,
    states: [{ form: SW_DEFAULT }, { form: LAKE_FORM }],
  },
  {
    name: 'risk',
    schema: risk.riskProjectSchema,
    toProject: risk.toProject as never,
    fromProject: risk.fromProject as never,
    states: [{ form: riskDefault() }, { form: riskState() }],
  },
  {
    name: 'cleanup',
    schema: cleanup.cleanupProjectSchema,
    toProject: cleanup.toProject as never,
    fromProject: cleanup.fromProject as never,
    states: [
      { form: defaultCleanupForm() },
      {
        form: {
          ...defaultCleanupForm(),
          source: 'vadose',
          chemicals: [chemical],
          b: defaultReceptor('worker'),
          allocation: 'cumulative',
        },
      },
    ],
  },
];

describe.each(cases)('screen project: $name', (c) => {
  it('round-trips every state through JSON, the schema and back, unchanged', () => {
    for (const state of c.states) {
      const snapshot = json(c.toProject(state));
      const parsed = c.schema.safeParse(snapshot);
      expect(parsed.success).toBe(true);
      expect(c.fromProject(parsed.data as never)).toEqual(state);
    }
  });

  it('keeps every field of the form (the schema drops nothing)', () => {
    for (const state of c.states) {
      const snapshot = json(c.toProject(state));
      const parsed = c.schema.safeParse(snapshot);
      expect(unknownKeyPaths(snapshot, parsed.data, c.name)).toEqual([]);
    }
  });

  it('does not alias the live state', () => {
    const state = structuredClone(c.states[0]);
    const snap = c.toProject(state) as Record<string, unknown>;
    expect(snap).not.toBe(state);
    const again = c.fromProject(c.schema.safeParse(json(snap)).data as never);
    expect(again).not.toBe(state);
  });

  it('gives the defaults for an absent screen and fills absent fields from them', () => {
    const fresh = c.fromProject(undefined as never);
    expect(fresh).toEqual(c.states[0]);
    const partial = c.schema.safeParse({ form: {} });
    expect(partial.success).toBe(true);
    expect(c.fromProject(partial.data as never)).toEqual(c.states[0]);
  });

  it('refuses a value of the wrong type', () => {
    expect(c.schema.safeParse({ form: 'not an object' }).success).toBe(false);
    expect(c.schema.safeParse('x').success).toBe(false);
  });
});

describe('screen project: household feed flags', () => {
  const oldRow = {
    id: '71-43-2',
    name: 'Benzene',
    conc: {},
    groundwaterFromWell: true,
  };
  it('loads a row saved before the household feeds with both feeds off', () => {
    const p = risk.riskProjectSchema.safeParse({ form: { chemicals: [oldRow] } });
    expect(p.success).toBe(true);
    const row = risk.fromProject(p.data).form.chemicals[0];
    expect(row?.bathroomFromHousehold).toBe(false);
    expect(row?.indoorFromHousehold).toBe(false);
    expect(row?.outdoorFromHousehold).toBe('');
    const c = cleanup.cleanupProjectSchema.safeParse({ form: { chemicals: [oldRow] } });
    expect(c.success).toBe(true);
    expect(cleanup.fromProject(c.data).form.chemicals[0]?.outdoorFromHousehold).toBe('');
  });
  it('round-trips each outdoor feed choice', () => {
    for (const v of ['', 'sprinkler', 'particulate'] as const) {
      const state = riskState();
      state.chemicals = [{ ...chemical, outdoorFromHousehold: v }];
      const p = risk.riskProjectSchema.safeParse(json(risk.toProject({ form: state })));
      expect(risk.fromProject(p.data).form.chemicals[0]?.outdoorFromHousehold).toBe(v);
    }
  });
  it('refuses an unknown outdoor feed', () => {
    expect(
      risk.riskProjectSchema.safeParse({
        form: { chemicals: [{ ...oldRow, outdoorFromHousehold: 'rain' }] },
      }).success,
    ).toBe(false);
  });
});

describe('screen project: field checks', () => {
  it('refuses an enum value the form does not allow', () => {
    expect(
      transport.transportProjectSchema.safeParse({ form: { loading: 'sinusoid' } }).success,
    ).toBe(false);
    expect(vapor.vaporProjectSchema.safeParse({ form: { foundation: 'tent' } }).success).toBe(
      false,
    );
    expect(cleanup.cleanupProjectSchema.safeParse({ form: { allocation: 'greedy' } }).success).toBe(
      false,
    );
  });
  it('keeps text that is not a number (a reload shows exactly what was typed)', () => {
    const p = transport.transportProjectSchema.safeParse({ form: { K: '1.', porosity: 'abc' } });
    expect(p.success).toBe(true);
    expect(transport.fromProject(p.data as never).form.porosity).toBe('abc');
  });
  it('rejects a number where the form holds a string', () => {
    expect(transport.transportProjectSchema.safeParse({ form: { K: 8.64 } }).success).toBe(false);
  });
  it('fills a chemical row flag that an older file lacks with false', () => {
    const p = risk.riskProjectSchema.safeParse({
      form: { chemicals: [{ id: 'x', name: 'X', conc: {} }] },
    });
    expect(p.success).toBe(true);
    const row = risk.fromProject(p.data as never).form.chemicals[0];
    expect(row?.groundwaterFromWell).toBe(false);
    expect(row?.dermalForm).toBeUndefined();
  });
  it('merges a second receptor over the receptor defaults', () => {
    const p = risk.riskProjectSchema.safeParse({ form: { b: { preset: 'worker' } } });
    expect(risk.fromProject(p.data as never).form.b).toEqual(defaultReceptor('worker'));
  });
});
