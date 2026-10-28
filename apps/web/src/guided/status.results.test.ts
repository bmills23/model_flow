import { describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from './state';
import { guidedStatus, type LevelsCheck, type OutputCheck } from './status';

const chemicals = [{ id: 'benzene' }, { id: 'toluene' }];
const allCurrent: OutputCheck = () => 'current';
const noneRun: OutputCheck = () => 'missing';
const someStale: OutputCheck = (_f, id) => (id === 'benzene' ? 'current' : 'stale');

const wellCleanup: GuidedState = (() => {
  const g = defaultGuided();
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
  g.targets.mode = 'cleanup';
  return g;
})();
const risk: GuidedState = { ...wellCleanup, targets: { ...wellCleanup.targets, mode: 'risk' } };
const mark = (g: GuidedState, outputCheck: OutputCheck, levelsCheck?: LevelsCheck) =>
  guidedStatus({
    chemicals,
    guided: g,
    outputCheck,
    ...(levelsCheck === undefined ? {} : { levelsCheck }),
  }).results;

describe('step 6 in the step list', () => {
  it('is done when step 3d and step 5 are done', () => {
    expect(mark(risk, allCurrent)).toBe('done');
    expect(mark(wellCleanup, allCurrent, () => 'current')).toBe('done');
  });

  it('is to do while step 3d has not run, or step 5 has no kept levels', () => {
    expect(mark(risk, noneRun)).toBe('todo');
    expect(mark(wellCleanup, allCurrent, () => 'missing')).toBe('todo');
  });

  it('follows run again from step 3d or step 5', () => {
    expect(mark(risk, someStale)).toBe('run-again');
    expect(mark(wellCleanup, allCurrent, () => 'stale')).toBe('run-again');
  });

  it('follows checking from step 5', () => {
    expect(mark(wellCleanup, allCurrent, () => 'unchecked')).toBe('checking');
  });
});
