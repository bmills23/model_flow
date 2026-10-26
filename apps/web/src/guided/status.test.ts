import { describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from './state';
import { chain } from './chain';
import { guidedStatus, hashOutputCheck, type OutputCheck } from './status';

const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  patch(g);
  return g;
};

// groundwater source, well path: one model chain with a source value to enter
const wellSite = (g: GuidedState): void => {
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
};

const chemicals = [{ id: 'benzene' }, { id: 'toluene' }];
const allCurrent: OutputCheck = () => 'current';
const noneRun: OutputCheck = () => 'missing';

describe('guidedStatus', () => {
  it('starts with every step to do', () => {
    const s = guidedStatus({ chemicals: [], guided: defaultGuided(), outputCheck: noneRun });
    expect(s.chemicals).toBe('todo');
    expect(s.site).toBe('todo');
    expect(s.properties).toBe('todo');
    expect(s.sources).toBe('todo');
    expect(s.run).toBe('todo');
  });

  it('step 1 is done with at least one chemical', () => {
    const s = guidedStatus({ chemicals, guided: defaultGuided(), outputCheck: noneRun });
    expect(s.chemicals).toBe('done');
  });

  it('step 2 is done while the chain has no problem', () => {
    const g = guidedWith(wellSite);
    expect(chain(g.site).problems).toEqual([]);
    expect(guidedStatus({ chemicals, guided: g, outputCheck: noneRun }).site).toBe('done');
    g.site.paths.well = false;
    expect(guidedStatus({ chemicals, guided: g, outputCheck: noneRun }).site).toBe('todo');
  });

  it('step 3a is done when the chain is sound and the injected check finds no blank field', () => {
    const g = guidedWith(wellSite);
    const input = { chemicals, guided: g, outputCheck: noneRun };
    expect(guidedStatus({ ...input, propertiesComplete: () => true }).properties).toBe('done');
    expect(guidedStatus({ ...input, propertiesComplete: () => false }).properties).toBe('todo');
    // a chain with a problem never counts, whatever the check says
    g.site.paths.well = false;
    expect(guidedStatus({ ...input, propertiesComplete: () => true }).properties).toBe('todo');
  });

  it('step 3b needs a value for every chemical and every source medium the chain needs', () => {
    const g = guidedWith(wellSite);
    const input = { chemicals, guided: g, outputCheck: noneRun };
    expect(guidedStatus(input).sources).toBe('todo');
    g.sources['benzene'] = {
      values: { groundwater: { value: '0.5', unit: 'mg/L' } },
      note: '',
      tph: '',
    };
    expect(guidedStatus(input).sources).toBe('todo');
    g.sources['toluene'] = {
      values: { groundwater: { value: 'ND', unit: 'mg/L' } },
      note: '',
      tph: '',
    };
    expect(guidedStatus(input).sources).toBe('done');
    g.sources['toluene']!.values.groundwater = { value: '  ', unit: 'mg/L' };
    expect(guidedStatus(input).sources).toBe('todo');
  });

  it('step 3b counts ND and a number above zero, not text a run cannot read', () => {
    const g = guidedWith(wellSite);
    const input = { chemicals, guided: g, outputCheck: noneRun };
    const put = (v: string) => {
      for (const id of ['benzene', 'toluene'])
        g.sources[id] = { values: { groundwater: { value: v, unit: 'ug/L' } }, note: '', tph: '' };
      return guidedStatus(input).sources;
    };
    expect(put('ND')).toBe('done');
    expect(put('12.5')).toBe('done');
    expect(put('abc')).toBe('todo');
    expect(put('0')).toBe('todo');
  });

  it('step 3d reads the injected output check for each chemical and chain output', () => {
    const g = guidedWith(wellSite);
    const input = { chemicals, guided: g };
    expect(guidedStatus({ ...input, outputCheck: allCurrent }).run).toBe('done');
    expect(guidedStatus({ ...input, outputCheck: noneRun }).run).toBe('todo');
    // an earlier Run left something behind that is now stale or missing: run again
    const asked: string[] = [];
    const mixed: OutputCheck = (feed, id) => {
      asked.push(`${feed}:${id}`);
      return id === 'benzene' ? 'current' : 'stale';
    };
    expect(guidedStatus({ ...input, outputCheck: mixed }).run).toBe('run-again');
    expect(asked).toContain('well:toluene');
    const partial: OutputCheck = (_f, id) => (id === 'benzene' ? 'current' : 'missing');
    expect(guidedStatus({ ...input, outputCheck: partial }).run).toBe('run-again');
  });

  it('step 3d is to do without chemicals or a sound chain, and never done when the chain has a problem', () => {
    expect(
      guidedStatus({ chemicals: [], guided: guidedWith(wellSite), outputCheck: allCurrent }).run,
    ).toBe('todo');
    expect(guidedStatus({ chemicals, guided: defaultGuided(), outputCheck: allCurrent }).run).toBe(
      'todo',
    );
  });

  it('steps that arrive later stay to do', () => {
    const s = guidedStatus({ chemicals, guided: guidedWith(wellSite), outputCheck: allCurrent });
    for (const id of ['pathways', 'receptors', 'toxicity', 'targets', 'results'] as const) {
      expect(s[id]).toBe('todo');
    }
  });

  it('the hash check: current while the recorded hash equals the live one, stale when not, missing when absent', () => {
    const outputs = {
      well: {
        benzene: { inputsHash: 'aaaa0001', value: {} },
        toluene: { inputsHash: 'bbbb0002', value: {} },
      },
    };
    const live = { well: { benzene: 'aaaa0001', toluene: 'cccc0003' }, household: { benzene: 'x' } };
    const check = hashOutputCheck(outputs, live);
    expect(check('well', 'benzene')).toBe('current');
    expect(check('well', 'toluene')).toBe('stale');
    expect(check('household', 'benzene')).toBe('missing');
    // an output the chain no longer chooses has no live hash: it is not current
    expect(hashOutputCheck(outputs, {})('well', 'benzene')).toBe('stale');
  });
});
