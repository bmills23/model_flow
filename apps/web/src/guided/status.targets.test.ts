import { describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from './state';
import { guidedStatus, type LevelsCheck, type OutputCheck } from './status';

const chemicals = [{ id: 'benzene' }, { id: 'toluene' }];
const allCurrent: OutputCheck = () => 'current';
const noneRun: OutputCheck = () => 'missing';

const site = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  patch(g);
  return g;
};
const wellCleanup = site((g) => {
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
  g.targets.mode = 'cleanup';
});
const mark = (g: GuidedState, outputCheck: OutputCheck, levelsCheck?: LevelsCheck) =>
  guidedStatus({
    chemicals,
    guided: g,
    outputCheck,
    ...(levelsCheck === undefined ? {} : { levelsCheck }),
  }).targets;

describe('step 5 in the step list', () => {
  it('forward risk is live: done once step 3d is done', () => {
    const g = { ...wellCleanup, targets: { ...wellCleanup.targets, mode: 'risk' as const } };
    expect(mark(g, allCurrent)).toBe('done');
    expect(mark(g, noneRun)).toBe('todo');
  });

  it('cleanup levels in the medium contacted are live too', () => {
    const g = site((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil'];
      x.targets.mode = 'cleanup';
    });
    expect(mark(g, allCurrent)).toBe('done');
  });

  it('cleanup levels through the well path follow each chemical kept level', () => {
    expect(mark(wellCleanup, allCurrent, () => 'current')).toBe('done');
    expect(mark(wellCleanup, allCurrent, (id) => (id === 'benzene' ? 'current' : 'stale'))).toBe(
      'run-again',
    );
    expect(mark(wellCleanup, allCurrent, () => 'missing')).toBe('todo');
    expect(mark(wellCleanup, allCurrent, () => 'unchecked')).toBe('checking');
    // without a check (nothing kept yet) the step is to do
    expect(mark(wellCleanup, allCurrent)).toBe('todo');
  });
});
