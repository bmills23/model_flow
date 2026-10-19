import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UncertainInput } from '@model-flow/engine';
import { forgetMemory, getScreen, setScreen } from '../project/store';
import { defaultUncertainty } from './project';
import { UncertaintyPanel, type PanelModel } from './UncertaintyPanel';
import { handleRows } from './protocol';
import type { WorkerLike } from './pool';

type I = { bw: number };
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
];
const model: PanelModel<I> = {
  uncertainInputs: inputs,
  run: (i) => ({ risk: 1 / i.bw }),
};
const outputs = [{ id: 'risk', label: 'Cancer risk', unit: '1', path: ['risk'] }];

function factory(): () => WorkerLike {
  return () => {
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => {},
      postMessage: (req) => {
        const r = handleRows(
          req,
          () => model as never,
          () => 0,
        );
        queueMicrotask(() => w.onmessage?.({ data: r }));
      },
    };
    return w;
  };
}

const panel = () => (
  <UncertaintyPanel
    model={model}
    modelId="test.model"
    base={{ bw: 70 }}
    outputs={outputs}
    makeWorker={factory()}
    workers={1}
    persistKey="risk"
    csvEditions={['rsl']}
  />
);

describe('uncertainty panel in the project', () => {
  beforeEach(() => {
    forgetMemory();
    setScreen('uncertainty', defaultUncertainty());
  });

  it('writes the distributions and run settings to the project and restores them on remount', () => {
    const { unmount } = render(panel());
    const row = screen.getByRole('group', { name: 'Body weight' });
    fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
    fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '50' } });
    fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '120' } });
    fireEvent.click(screen.getByLabelText(/sobol/i));
    const saved = getScreen('uncertainty').risk;
    expect(saved.rows['bw']).toMatchObject({ kind: 'uniform', params: { a: '50', b: '100' } });
    expect(saved).toMatchObject({ seed: 'abc', iterations: '120', sobol: true });
    expect(getScreen('uncertainty').cleanup).toEqual(defaultUncertainty().cleanup);
    unmount();

    render(panel());
    const again = screen.getByRole('group', { name: 'Body weight' });
    expect((within(again).getByLabelText(/^distribution$/i) as HTMLSelectElement).value).toBe(
      'uniform',
    );
    expect((within(again).getByLabelText(/minimum/i) as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText(/seed/i) as HTMLInputElement).value).toBe('abc');
    expect((screen.getByLabelText(/iterations/i) as HTMLInputElement).value).toBe('120');
    expect((screen.getByLabelText(/also compute sobol/i) as HTMLInputElement).checked).toBe(true);
    // the restored setup runs without any further edit
    expect(
      (screen.getByRole('button', { name: /run uncertainty/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('offers the summary, sample and sensitivity as CSV after a run', async () => {
    render(panel());
    const row = screen.getByRole('group', { name: 'Body weight' });
    fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
    fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '50' } });
    fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /run uncertainty/i }));
    await screen.findByRole('table', { name: /summary of the output/i });
    for (const label of ['summary', 'sample', 'sensitivity']) {
      expect(screen.getByRole('button', { name: `Download CSV: ${label}` })).toBeTruthy();
    }
  });
});
