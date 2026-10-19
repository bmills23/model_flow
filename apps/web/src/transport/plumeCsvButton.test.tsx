import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DownloadCsv } from '../export/DownloadCsv';
import type { ComputeResult } from './compute';
import { plumeCsvTable } from './csv';

const result = {
  xs: [0, 1],
  ys: [0, 1],
  grid: [
    [0, 1],
    [2, 3],
  ],
  times: [],
  series: {},
  readouts: {},
  warnings: [],
} as unknown as ComputeResult;

describe('plume CSV control', () => {
  it('is a named button reachable by keyboard', () => {
    render(<DownloadCsv showLabel tables={[plumeCsvTable(result, 'modern', 10)]} />);
    const b = screen.getByRole('button', { name: 'Download CSV: plume grid' });
    expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    expect((b as HTMLButtonElement).disabled).toBe(false);
    b.focus();
    expect(document.activeElement).toBe(b);
  });
});
