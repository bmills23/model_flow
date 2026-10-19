import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UncertainInput } from '@model-flow/engine';
import { DistributionEditor } from './DistributionEditor';
import type { EditorSpec } from './editor';

type I = { v: number };
function inp(id: string, label: string, bounds: [number, number] = [0, 1000]): UncertainInput<I> {
  return {
    id,
    label,
    unit: 'kg',
    category: 'exposure',
    bounds,
    get: (i) => i.v,
    set: (i, v) => ({ ...i, v }),
  };
}
const inputs = [inp('a', 'Body weight'), inp('b', 'Intake'), inp('c', 'Frequency')];

function setup() {
  const onChange = vi.fn<(s: EditorSpec) => void>();
  render(<DistributionEditor inputs={inputs} onChange={onChange} />);
  return onChange;
}
const last = (f: ReturnType<typeof setup>) => f.mock.calls[f.mock.calls.length - 1]![0];

function choose(label: string, kind: string) {
  const row = screen.getByRole('group', { name: label });
  fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: kind } });
  return row;
}

describe('DistributionEditor', () => {
  it('lists every input as a point value and reports an empty ok specification', () => {
    const f = setup();
    expect(screen.getAllByRole('group', { name: /body weight|intake|frequency/i }).length).toBe(3);
    expect(last(f).ok).toBe(true);
    expect(Object.keys(last(f).distributions)).toEqual([]);
  });

  it('shows the parameter fields of the chosen kind and reports the SI distribution', () => {
    const f = setup();
    const row = choose('Body weight', 'normal');
    fireEvent.change(within(row).getByLabelText(/^mean/i), { target: { value: '70' } });
    fireEvent.change(within(row).getByLabelText(/standard deviation/i), {
      target: { value: '10' },
    });
    fireEvent.change(within(row).getByLabelText(/lower truncation/i), { target: { value: '30' } });
    fireEvent.change(within(row).getByLabelText(/upper truncation/i), { target: { value: '120' } });
    expect(last(f).ok).toBe(true);
    expect(last(f).distributions.a).toEqual({ kind: 'normal', mean: 70, sd: 10, lo: 30, hi: 120 });
    expect(within(row).getByRole('img', { name: /cumulative distribution/i })).toBeTruthy();
  });

  it('shows a refusal for a support outside the physical bounds', () => {
    const f = setup();
    const row = choose('Body weight', 'normal');
    fireEvent.change(within(row).getByLabelText(/^mean/i), { target: { value: '70' } });
    fireEvent.change(within(row).getByLabelText(/standard deviation/i), {
      target: { value: '10' },
    });
    expect(last(f).ok).toBe(false);
    expect(within(row).getByRole('alert').textContent).toMatch(/bounds/i);
  });

  it('adds a correlation between two sampled inputs and refuses one that is not positive definite', () => {
    const f = setup();
    for (const label of ['Body weight', 'Intake', 'Frequency']) {
      const row = choose(label, 'uniform');
      fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '1' } });
      fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '2' } });
    }
    const panel = screen.getByRole('region', { name: /rank correlation/i });
    const set = (x: string, y: string, v: string) => {
      fireEvent.change(within(panel).getByLabelText(/first input/i), { target: { value: x } });
      fireEvent.change(within(panel).getByLabelText(/second input/i), { target: { value: y } });
      fireEvent.change(within(panel).getByLabelText(/^correlation/i), { target: { value: v } });
      fireEvent.click(within(panel).getByRole('button', { name: /add pair/i }));
    };
    set('a', 'b', '0.5');
    expect(last(f).ok).toBe(true);
    expect(last(f).correlation?.matrix).toEqual([
      [1, 0.5],
      [0.5, 1],
    ]);
    set('b', 'c', '0.9');
    set('a', 'c', '-0.9');
    expect(last(f).ok).toBe(false);
    expect(within(panel).getByRole('alert').textContent).toMatch(/positive definite/i);
    fireEvent.click(within(panel).getAllByRole('button', { name: /remove/i })[0]!);
    fireEvent.click(within(panel).getAllByRole('button', { name: /remove/i })[0]!);
    expect(last(f).ok).toBe(true);
  });
});
