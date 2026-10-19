import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CdfChart,
  FanChart,
  HistogramChart,
  SobolChart,
  SpearmanChart,
  SummaryTable,
  TornadoChart,
} from './ResultsCharts';
import { empiricalCdf, fanBands, histogram, summaryRows } from './resultsData';

describe('ResultsCharts', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('draws the CDF with a labelled image and marks the base value', () => {
    render(<CdfChart points={empiricalCdf(values)} base={5} unit="kg" />);
    const fig = screen.getByRole('img', { name: /cumulative distribution/i });
    expect(fig.querySelector('path.chart-line')).toBeTruthy();
    expect(fig.querySelector('line.chart-base')).toBeTruthy();
  });

  it('draws one bar per histogram bin and says when the axis is logarithmic', () => {
    const wide = [1, 10, 100, 1000, 10000, 5, 50, 500];
    render(<HistogramChart hist={histogram(wide, 6)} base={undefined} unit="1" />);
    const fig = screen.getByRole('img', { name: /histogram/i });
    expect(fig.querySelectorAll('rect.chart-bar').length).toBe(6);
    expect(screen.getByText(/log scale/i)).toBeTruthy();
  });

  it('draws the five fan bands and the base curve', () => {
    const f = fanBands(
      [1, 2, 3],
      [0, 1, 2, 3, 4].map((k) => [k, k + 1, k + 2]),
    );
    render(<FanChart fan={f} base={[2, 3, 4]} timeLabel="Time (yr)" unit="mg/L" />);
    const fig = screen.getByRole('img', { name: /percentile fan/i });
    expect(fig.querySelectorAll('path.fan-band').length).toBe(2);
    expect(fig.querySelector('path.fan-median')).toBeTruthy();
    expect(fig.querySelector('path.fan-base')).toBeTruthy();
  });

  it('draws a tornado bar per input, labelled as one-at-a-time', () => {
    render(
      <TornadoChart
        base={5}
        unit="1"
        rows={[
          { label: 'Body weight', low: 2, high: 9, lowInput: 1, highInput: 2, ok: true },
          { label: 'Intake', low: 4, high: 6, lowInput: 1, highInput: 2, ok: true },
          { label: 'Bad', low: Number.NaN, high: 6, lowInput: 1, highInput: 2, ok: false },
        ]}
      />,
    );
    const fig = screen.getByRole('img', { name: /tornado/i });
    expect(fig.querySelectorAll('rect.tornado-bar').length).toBe(2);
    expect(screen.getByText(/one input at a time/i)).toBeTruthy();
    expect(screen.getByText(/did not run/i)).toBeTruthy();
  });

  it('draws Sobol first and total bars with their intervals', () => {
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
            converged: false,
          },
        ]}
      />,
    );
    const fig = screen.getByRole('img', { name: /sobol/i });
    expect(fig.querySelectorAll('rect.sobol-first').length).toBe(1);
    expect(fig.querySelectorAll('rect.sobol-total').length).toBe(1);
    expect(fig.querySelectorAll('line.sobol-whisker').length).toBe(2);
    expect(screen.getByText(/not converged/i)).toBeTruthy();
  });

  it('draws Spearman bars', () => {
    render(<SpearmanChart rows={[{ label: 'Intake', rho: -0.4 }]} />);
    expect(screen.getByRole('img', { name: /spearman/i }).querySelectorAll('rect').length).toBe(1);
  });

  it('lists the summary statistics in a table', () => {
    render(
      <SummaryTable
        rows={summaryRows({
          n: 10,
          min: 1,
          p5: 1.45,
          p25: 3.25,
          p50: 5.5,
          p75: 7.75,
          p90: 9.1,
          p95: 9.55,
          max: 10,
          mean: 5.5,
          sd: 3.03,
        })}
        unit="kg"
      />,
    );
    const t = screen.getByRole('table');
    expect(within(t).getByText('Median')).toBeTruthy();
    expect(within(t).getAllByRole('row').length).toBe(11);
  });
});
