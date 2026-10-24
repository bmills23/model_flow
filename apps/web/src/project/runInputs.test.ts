import { afterEach, describe, expect, it } from 'vitest';
import { clearHouseholdFeed, getHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import { transportBlocks, vaporBlocks, type Slots } from '../report/chemicalBlocks';
import { getWellFeedSlots } from '../transport/wellFeed';
import { getVaporRiskFeedSlots } from '../vapor/feeds';
import { clearProduceFeed, getProduceFeed, setProduceFeed } from '../plantsEco/feeds';
import {
  clearSurfaceWaterFeed,
  getSurfaceWaterFeed,
  setSurfaceWaterFeed,
} from '../surfaceWater/feed';
import { clearWellFeed, getWellFeed, setWellFeed } from '../transport/wellFeed';
import { clearVaporRiskFeed, getVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { parseProject } from './index';
import { serializeProject } from './file';
import { feedShapes } from './schema';
import {
  dropMalformedRunInputs,
  isRunInputRows,
  readRunInputs,
  withoutRunInputs,
} from './runInputs';
import {
  currentProject,
  forgetMemory,
  getScreen,
  getStaleFeeds,
  loadProject,
  setScreen,
} from './store';

const ROWS = [
  { label: 'Source concentration', value: '10 mg/L' },
  { label: 'Seepage velocity', value: '37.9 m/yr' },
];
const env = (value: unknown) => ({ source: 'x', inputsHash: 'h', value });

const well = {
  method: 'modern' as const,
  label: 'Receptor well',
  times: [0, 10],
  values: [0, 1e-6],
  chemicalId: '71-43-2',
};
const water = {
  method: 'well-mixed' as const,
  origin: 'surfaceWater.well-mixed',
  label: 'sw',
  times: [1, 2],
  values: [1e-6, 2e-6],
  chemicalId: '71-43-2',
};
const vaporRisk = { chemicalId: '71-43-2', label: 'vapor' };
const household = {
  chemicalId: '71-43-2',
  label: 'household',
  coefficients: {},
  methods: {},
};
const produce = {
  chemicalId: '71-43-2',
  label: 'produce',
  method: 'plantUptake.hhrap-2005',
  factors: {},
  intakes: {},
  intakeLabel: 'user entered',
};

afterEach(() => {
  clearWellFeed();
  clearSurfaceWaterFeed();
  clearVaporRiskFeed();
  clearHouseholdFeed();
  clearProduceFeed();
  forgetMemory();
});

describe('recorded run inputs: helpers', () => {
  it('reads rows only when every row is a label and a value in text', () => {
    expect(isRunInputRows(ROWS)).toBe(true);
    expect(isRunInputRows([{ label: 'a', value: 3 }])).toBe(false);
    expect(isRunInputRows('rows')).toBe(false);
    expect(readRunInputs({ runInputs: ROWS })).toEqual(ROWS);
    expect(readRunInputs({ runInputs: 'bad' })).toBeNull();
    expect(readRunInputs({ runInputs: [] })).toBeNull();
    expect(readRunInputs({})).toBeNull();
    expect(readRunInputs(null)).toBeNull();
  });

  it('removes a malformed value and keeps a good one', () => {
    expect(dropMalformedRunInputs({ a: 1, runInputs: 'bad' })).toEqual({ a: 1 });
    const good = { a: 1, runInputs: ROWS };
    expect(dropMalformedRunInputs(good)).toBe(good);
  });

  it('leaves the recorded rows out of a fingerprint', () => {
    expect(withoutRunInputs({ a: 1, runInputs: ROWS })).toEqual({ a: 1 });
    const plain = { a: 1 };
    expect(withoutRunInputs(plain)).toBe(plain);
    expect(withoutRunInputs(null)).toBeNull();
  });
});

describe('recorded run inputs: the project file shapes', () => {
  const cases = [
    ['well', well],
    ['surfaceWater', water],
    ['vaporRisk', vaporRisk],
    ['household', household],
    ['produce', produce],
  ] as const;

  for (const [key, v] of cases) {
    it(`${key}: keeps the rows, accepts a slot without them, and drops malformed rows without failing the slot`, () => {
      const shape = feedShapes[key];
      const kept = shape.safeParse(env({ ...v, runInputs: ROWS }));
      expect(kept.success).toBe(true);
      expect((kept.data as { value: { runInputs?: unknown } }).value.runInputs).toEqual(ROWS);

      const old = shape.safeParse(env(v));
      expect(old.success).toBe(true);
      expect((old.data as { value: object }).value).not.toHaveProperty('runInputs');

      for (const bad of ['rows', [{ label: 'a', value: 5 }], { label: 'a' }]) {
        const r = shape.safeParse(env({ ...v, runInputs: bad }));
        expect(r.success).toBe(true);
        const value = (r.data as { value: Record<string, unknown> }).value;
        expect(value['runInputs']).toBeUndefined();
        expect(value['label']).toBe(v.label);
      }
    });
  }
});

describe('recorded run inputs: save and open', () => {
  it('a saved and reopened project holds the rows of every feed, with no warning', () => {
    setWellFeed({ ...well, runInputs: ROWS });
    setSurfaceWaterFeed({ ...water, runInputs: ROWS });
    setVaporRiskFeed({ ...vaporRisk, runInputs: ROWS });
    setHouseholdFeed({ ...household, runInputs: ROWS });
    setProduceFeed({ ...produce, runInputs: ROWS });
    const text = serializeProject(currentProject());
    clearWellFeed();
    clearSurfaceWaterFeed();
    clearVaporRiskFeed();
    clearHouseholdFeed();
    clearProduceFeed();
    const r = parseProject(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings).toEqual([]);
    expect(r.droppedFeeds).toEqual([]);
    loadProject(r.project);
    expect(getWellFeed('71-43-2')?.runInputs).toEqual(ROWS);
    expect(getSurfaceWaterFeed('71-43-2')?.runInputs).toEqual(ROWS);
    expect(getVaporRiskFeed('71-43-2')?.runInputs).toEqual(ROWS);
    expect(getHouseholdFeed('71-43-2')?.runInputs).toEqual(ROWS);
    expect(getProduceFeed('71-43-2')?.runInputs).toEqual(ROWS);
  });

  it('the report block of a reopened project prints the rows, and of an old one says they were not recorded', () => {
    const slots: Slots = <T>(key: string) =>
      (key === 'well'
        ? getWellFeedSlots()
        : key === 'vaporRisk'
          ? getVaporRiskFeedSlots()
          : new Map()) as ReadonlyMap<string, T>;
    const nameOf = () => 'Benzene';
    setWellFeed({ ...well, runInputs: ROWS });
    setVaporRiskFeed(vaporRisk);
    const r = parseProject(serializeProject(currentProject()));
    if (!r.ok) throw new Error(r.error);
    clearWellFeed();
    clearVaporRiskFeed();
    loadProject(r.project);
    const [t] = transportBlocks(slots, nameOf);
    expect(t!.inputs).toEqual(expect.arrayContaining(ROWS));
    expect(t!.notes.join(' ')).not.toMatch(/not recorded/);
    const [v] = vaporBlocks(slots, nameOf);
    expect(v!.inputs).toEqual([]);
    expect(v!.notes.join(' ')).toMatch(
      /not recorded.*send it again from the vapor intrusion screen/,
    );
  });

  it('a project saved before the rows existed opens without them and without a warning', () => {
    setWellFeed(well);
    setVaporRiskFeed(vaporRisk);
    const text = serializeProject(currentProject());
    clearWellFeed();
    clearVaporRiskFeed();
    const r = parseProject(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings).toEqual([]);
    loadProject(r.project);
    expect(getWellFeed('71-43-2')).toEqual(well);
    expect(getVaporRiskFeed('71-43-2')?.runInputs).toBeUndefined();
  });

  it('malformed rows in a file are dropped and the feed still opens', () => {
    setWellFeed({ ...well, runInputs: ROWS });
    const doc = JSON.parse(serializeProject(currentProject()));
    doc.feeds.well['71-43-2'].value.runInputs = 'broken';
    const r = parseProject(doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.droppedFeeds).toEqual([]);
    loadProject(r.project);
    expect(getWellFeed('71-43-2')?.values).toEqual(well.values);
    expect(getWellFeed('71-43-2')?.runInputs).toBeUndefined();
  });
});

describe('recorded run inputs change no mark', () => {
  it('sending the same values with other rows is not an input change for a screen that reads the feed', () => {
    const h = getScreen('household');
    setScreen('household', {
      form: { ...h.form, chemicalId: '71-43-2', showerWaterSource: 'well' },
    });
    setWellFeed(well);
    setHouseholdFeed(household);
    expect(getStaleFeeds()).toEqual([]);
    setWellFeed({ ...well, runInputs: ROWS });
    expect(getStaleFeeds()).toEqual([]);
    setWellFeed({ ...well, runInputs: [{ label: 'other', value: '1 m' }] });
    expect(getStaleFeeds()).toEqual([]);
    setWellFeed({ ...well, values: [0, 9e-6] });
    expect(getStaleFeeds()).toEqual(['household']);
  });
});
