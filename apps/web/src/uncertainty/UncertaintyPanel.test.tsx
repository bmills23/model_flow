import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UncertainInput } from '@model-flow/engine';
import { UncertaintyPanel, type PanelModel } from './UncertaintyPanel';
import { handleRows } from './protocol';
import type { WorkerLike } from './pool';

type I = { bw: number; ef: number };
const inputs: UncertainInput<I>[] = [
  {
    id: 'bw',
    label: 'Body weight',
    unit: 'kg',
    category: 'exposure',
    bounds: [1, 500],
    get: (i) => i.bw,
    set: (i, v) => ({ ...i, bw: v }),
  },
  {
    id: 'ef',
    label: 'Frequency',
    unit: '1',
    category: 'exposure',
    bounds: [0, 1],
    get: (i) => i.ef,
    set: (i, v) => ({ ...i, ef: v }),
  },
];
const model: PanelModel<I> = {
  uncertainInputs: inputs,
  run: (i) => ({ risk: (1e-4 * i.ef) / i.bw, hi: 1 / i.bw }),
};
const base: I = { bw: 70, ef: 0.5 };
const outputs = [
  { id: 'risk', label: 'Cancer risk', unit: '1', path: ['risk'] },
  { id: 'hi', label: 'Hazard index', unit: '1', path: ['hi'] },
];

function factory(elapsedMs = 0.01): () => WorkerLike {
  return () => {
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => {},
      postMessage: (req) => {
        const r = handleRows(
          req,
          () => model as never,
          (() => {
            let t = 0;
            return () => (t += elapsedMs);
          })(),
        );
        queueMicrotask(() => w.onmessage?.({ data: r }));
      },
    };
    return w;
  };
}

function sampleBodyWeight() {
  const row = screen.getByRole('group', { name: 'Body weight' });
  fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
  fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '50' } });
  fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '100' } });
}

function setup(elapsedMs?: number) {
  render(
    <UncertaintyPanel
      model={model}
      modelId="test.model"
      base={base}
      outputs={outputs}
      makeWorker={factory(elapsedMs)}
      workers={1}
    />,
  );
}

describe('UncertaintyPanel', () => {
  it('will not run until an input has a distribution', () => {
    setup();
    expect(
      (screen.getByRole('button', { name: /run uncertainty/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the seed and iteration count, runs, and draws every result', async () => {
    setup();
    sampleBodyWeight();
    expect((screen.getByLabelText(/seed/i) as HTMLInputElement).value).toBe('model-flow');
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
    await screen.findByRole('table', { name: /summary of the output/i });
    expect(
      screen.getByRole('img', { name: /cumulative distribution of the output/i }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /histogram/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /tornado/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /spearman/i })).toBeTruthy();
    expect(screen.getByText(/200 of 200 iterations/i)).toBeTruthy();
  });

  it('gives the same numbers for the same seed and a different set for another seed', async () => {
    setup();
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '100' } });
    const run = async () => {
      fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
      const t = await screen.findByRole('table', { name: /summary of the output/i });
      return t.textContent;
    };
    const a = await run();
    const b = await run();
    expect(b).toBe(a);
    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'other' } });
    await waitFor(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
      const t = await screen.findByRole('table', { name: /summary of the output/i });
      expect(t.textContent).not.toBe(a);
    });
  });

  it('runs Sobol on request and draws the indices', async () => {
    setup();
    sampleBodyWeight();
    const row = screen.getByRole('group', { name: 'Frequency' });
    fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
    fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '0.2' } });
    fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '0.9' } });
    fireEvent.click(screen.getByLabelText(/sobol/i));
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
    await screen.findByRole('img', { name: /sobol/i });
  });

  it('asks before a run projected above 60 s and stops when declined', async () => {
    setup(1000);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/projected/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await screen.findByText(/run was cancelled/i);
    expect(screen.queryByRole('table', { name: /summary of the output/i })).toBeNull();
  });

  it('refuses a run projected above 10 minutes', async () => {
    setup(100000);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/run-budget/);
  });
});
