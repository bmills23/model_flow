// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SurfaceWaterTargetPanel } from './SurfaceWaterPanel';
import type { SurfaceSolved } from './surfaceSolve';
import { interpretSolved } from './surfaceSolved';
import type { SurfaceTargetLevel } from './surfaceWaterTarget';

afterEach(cleanup);

const solved: SurfaceSolved = {
  target: 5e-3,
  level: null,
  reached: false,
  limit: 1.78e-3,
  maxSurface: 7.2e-5,
  solver: 'brent',
  residual: 0,
  acceptance: 0,
  evaluations: 30,
  iterations: 30,
  warnings: [],
  reason: null,
};

/** The row a target the path cannot reach gives, built the way the page builds it. */
function notReachedRow(): SurfaceTargetLevel {
  const s = interpretSolved(solved, 'groundwater', { fromSi: 1e6, unit: 'ug/L' });
  return {
    chemicalId: '71-43-2',
    chemical: 'Benzene',
    feedChemicalId: '71-43-2',
    target: solved.target,
    targetUnit: 'ug/L',
    targetFromSi: 1e6,
    basis: 'User value',
    citationKey: null,
    citation: 'User value (this project)',
    note: 'State standard',
    level: s.level,
    surfaceMethod: 'mass-discharge',
    reason: s.reason,
    sourceMedium: 'groundwater',
    unit: 'mg/L',
    fromSi: 1e3,
    path: 'solved',
    solver: null,
    job: null,
    pending: false,
    warnings: s.warnings,
  };
}

describe('surface water target row for a target the path cannot reach', () => {
  it('shows no level and says not reached, with the limit', () => {
    const { container } = render(<SurfaceWaterTargetPanel rows={[notReachedRow()]} />);
    const row = container.querySelector('tbody tr')!;
    expect(row.textContent).toMatch(/Benzene/);
    expect(row.querySelector('.level')!.textContent?.trim()).toBe('not quantified');
    const text = container.querySelector('ul.warnings')!.textContent ?? '';
    expect(text).toMatch(/Not quantified: .*is not reached/);
    expect(text).toMatch(/the solubility entered on the surface water run \(1\.78 mg\/L\)/);
    expect(text).toMatch(/peaks at 72 ug\/L/);
  });
});
