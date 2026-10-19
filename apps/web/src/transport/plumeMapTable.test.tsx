import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComputeResult } from './compute';
import type { Scenario } from './form';
import { PlumeMap } from './PlumeMap';

describe('PlumeMap data table', () => {
  it('lists the centreline concentration at each x behind a toggle', () => {
    const result = {
      xs: [0, 10, 20],
      ys: [-5, 0, 5],
      grid: [
        [0, 0.002, 0],
        [0, 0.001, 0],
        [0, 0.0005, 0],
      ],
    } as unknown as ComputeResult;
    const scenario = {
      extent: { xMin: 0, xMax: 20, yHalf: 5 },
      source: { x1: 0, x2: 2, y1: -1, y2: 1, z1: 0, z2: 1 },
      receptor: { x: 10, y: 0, z: 0 },
    } as unknown as Scenario;
    render(
      <PlumeMap
        result={result}
        scenario={scenario}
        scale="linear"
        methodLabel="Modern"
        timeLabel="10 yr"
        depthLabel="top"
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show data table/i }));
    const t = screen.getByRole('table');
    expect(within(t).getAllByRole('row').length).toBe(4);
    expect(within(t).getByText('10')).toBeTruthy();
  });
});
