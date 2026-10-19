import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CdfChart,
  FanChart,
  HistogramChart,
  SobolChart,
  SpearmanChart,
  TornadoChart,
} from './ResultsCharts';
import { empiricalCdf, fanBands, histogram } from './resultsData';

function openTable(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /show data table/i }));
  return screen.getByRole('table');
}

const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('every uncertainty chart has a data table behind a toggle', () => {
  it('CDF lists output values at fixed probabilities', () => {
    render(<CdfChart points={empiricalCdf(values)} base={5} unit="kg" />);
    const t = openTable();
    expect(within(t).getByRole('columnheader', { name: /probability/i })).toBeTruthy();
    expect(within(t).getAllByRole('row').length).toBeGreaterThan(3);
    expect(within(t).getAllByRole('row').length).toBeLessThan(20);
  });

  it('histogram lists every bin with its count', () => {
    const h = histogram(values, 4);
    render(<HistogramChart hist={h} base={undefined} unit="kg" />);
    const t = openTable();
    expect(within(t).getAllByRole('row').length).toBe(1 + h.counts.length);
  });

  it('fan lists each time with the five percentile values', () => {
    const f = fanBands(
      [1, 2, 3],
      [0, 1, 2, 3, 4].map((k) => [k, k + 1, k + 2]),
    );
    render(<FanChart fan={f} base={[2, 3, 4]} timeLabel="Time (yr)" unit="mg/L" />);
    const t = openTable();
    expect(within(t).getAllByRole('row').length).toBe(4);
    expect(within(t).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(7);
  });

  it('tornado lists each input with its low and high output', () => {
    render(
      <TornadoChart
        base={5}
        unit="1"
        rows={[
          { label: 'Body weight', low: 2, high: 9, lowInput: 1, highInput: 2, ok: true },
          { label: 'Intake', low: 4, high: 6, lowInput: 1, highInput: 2, ok: true },
        ]}
      />,
    );
    const t = openTable();
    expect(within(t).getByText('Body weight')).toBeTruthy();
    expect(within(t).getAllByRole('row').length).toBe(3);
  });

  it('Sobol lists first order and total indices with their intervals', () => {
    render(
      <SobolChart
        rows={[
          {
            label: 'Body weight',
            first: 0.5,
            firstRaw: 0.5,
            firstInterval: [0.45, 0.55],
            total: 0.6,
            totalInterval: [0.5, 0.7],
            converged: true,
          },
        ]}
      />,
    );
    const t = openTable();
    expect(within(t).getByText('Body weight')).toBeTruthy();
    expect(within(t).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(5);
  });

  it('Spearman lists each rank correlation', () => {
    render(<SpearmanChart rows={[{ label: 'Intake', rho: -0.4 }]} />);
    const t = openTable();
    expect(within(t).getByText('Intake')).toBeTruthy();
    expect(within(t).getByText(/-0\.4/)).toBeTruthy();
  });
});
