import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComputeResult } from './compute';
import type { Scenario } from './form';
import { BreakthroughChart } from './BreakthroughChart';
import { PlumeMap } from './PlumeMap';

describe('BreakthroughChart arrow keys', () => {
  const result = {
    times: [0, 3.15576e7, 6.31152e7],
    series: { modern: [0, 0.001, 0.002] },
  } as unknown as ComputeResult;

  it('is focusable and moves the readout with the arrow keys, Home and End', () => {
    render(<BreakthroughChart result={result} scale="linear" />);
    const svg = screen.getByRole('img', { name: /breakthrough curves/i });
    expect(svg.getAttribute('tabindex')).toBe('0');
    const probe = (): string => document.querySelector('.probe')!.textContent ?? '';
    expect(probe()).toMatch(/arrow keys/i);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(probe()).toMatch(/t = 1\.0 yr/);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(probe()).toMatch(/t = 2\.0 yr/);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(probe()).toMatch(/t = 2\.0 yr/);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(probe()).toMatch(/t = 1\.0 yr/);
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(probe()).toMatch(/t = 0\.0 yr/);
    fireEvent.keyDown(svg, { key: 'End' });
    expect(probe()).toMatch(/t = 2\.0 yr/);
    expect(document.querySelector('.probe')!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('PlumeMap arrow keys', () => {
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

  it('is focusable and moves the readout one grid cell per arrow key', () => {
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
    const svg = screen.getByRole('img', { name: /plume map/i });
    expect(svg.getAttribute('tabindex')).toBe('0');
    const probe = (): string => document.querySelector('.probe')!.textContent ?? '';
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(probe()).toMatch(/x 20 m, y 0 m/);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(probe()).toMatch(/x 20 m, y 0 m/);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(probe()).toMatch(/x 10 m, y 0 m/);
    fireEvent.keyDown(svg, { key: 'ArrowUp' });
    expect(probe()).toMatch(/x 10 m, y 5 m/);
    fireEvent.keyDown(svg, { key: 'ArrowDown' });
    fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(probe()).toMatch(/x 10 m, y -5 m/);
    expect(document.querySelector('.probe')!.getAttribute('aria-live')).toBe('polite');
  });
});
