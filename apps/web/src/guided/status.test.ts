import { describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from './state';
import { chain } from './chain';
import { blankTemplate, propertyView, setProperty } from './propertyCatalog';
import { guidedStatus, type OutputCheck } from './status';

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

  it('step 3a reads the property catalog when no check is injected: a needed blank keeps it to do', () => {
    const g = guidedWith(wellSite);
    const input = { chemicals, guided: g, outputCheck: noneRun };
    // a template saved for every chosen model is not enough: the dispersivities are still blank
    g.forms.transport = blankTemplate('transport');
    g.forms.household = blankTemplate('household');
    expect(guidedStatus(input).properties).toBe('todo');
    let filled = g;
    for (const f of propertyView(g).groups.flatMap((x) => x.fields)) {
      if (f.needed) filled = setProperty(filled, f.field.id, '1');
    }
    expect(guidedStatus({ ...input, guided: filled }).properties).toBe('done');
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
});
