import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunPlan } from './derive';
import { RunResults } from './RunResults';

afterEach(cleanup);

const plan = {
  models: ['vapor'],
  outputs: [],
  settings: { basis: 'modern', nCurve: 32, vaporMethod: 'modern', surfaceMethod: 'mass-discharge' },
} as unknown as RunPlan;

describe('RunResults notes', () => {
  it('lists the values counted as half a limit or as zero under the chemical', () => {
    render(
      <RunResults
        outputs={{}}
        chemicals={[{ id: 'a', name: 'Benzene' }]}
        plan={plan}
        run={{ timeYr: '30', stepYr: '1', sourceYr: '', basis: 'modern' }}
        notes={{
          a: {
            problems: [],
            feeds: {},
            substitutions: [
              'Benzene in groundwater was below the reporting limit of 0.5 ug/L and was counted as 0.25 ug/L, half the limit.',
            ],
          },
        }}
      />,
    );
    const group = screen.getByRole('group', { name: 'Benzene' });
    expect(within(group).getByText(/counted as 0\.25 ug\/L, half the limit/)).toBeTruthy();
    expect(within(group).queryByRole('alert')).toBeNull();
  });
});
