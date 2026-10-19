import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComputeResult } from './compute';
import type { Scenario } from './form';
import { PlumeMap } from './PlumeMap';
import { TablesAlwaysOpen } from '../vadose/tablesOpen';

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

  it('thins the table to a cap, keeping the first and last x, and says so in the caption', () => {
    const n = 100;
    const xs = Array.from({ length: n }, (_, i) => i);
    const result = {
      xs,
      ys: [-5, 0, 5],
      grid: xs.map(() => [0, 0.001, 0]),
    } as unknown as ComputeResult;
    const scenario = {
      extent: { xMin: 0, xMax: 99, yHalf: 5 },
      source: { x1: 0, x2: 2, y1: -1, y2: 1, z1: 0, z2: 1 },
      receptor: { x: 10, y: 0, z: 0 },
    } as unknown as Scenario;
    render(
      <TablesAlwaysOpen.Provider value={true}>
        <PlumeMap
          result={result}
          scenario={scenario}
          scale="linear"
          methodLabel="Modern"
          timeLabel="10 yr"
          depthLabel="top"
          tableMaxRows={20}
        />
      </TablesAlwaysOpen.Provider>,
    );
    const t = screen.getByRole('table');
    const rows = within(t).getAllByRole('row');
    expect(rows.length).toBe(21);
    expect(within(rows[1]!).getAllByRole('cell')[0]!.textContent).toBe('0');
    expect(within(rows[20]!).getAllByRole('cell')[0]!.textContent).toBe('99');
    expect(t.querySelector('caption')!.textContent).toMatch(/20 of 100/);
  });
});
