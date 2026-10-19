import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { registry } from '@model-flow/engine';
import { buildProject, defaultScreens } from '../project';
import { loadChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { emptyRow } from '../uncertainty/editor';
import { handleRows } from '../uncertainty/protocol';
import type { WorkerLike } from '../uncertainty/pool';
import { ReportUncertainty } from './UncertaintyResults';

function makeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => {},
    postMessage: (req) => {
      const r = handleRows(req, (id) => registry.get(id) as never);
      queueMicrotask(() => w.onmessage?.({ data: r }));
    },
  };
  return w;
}

async function projectWithSetup() {
  const db = await loadChemicalDb();
  const rec = newChemicalRow(db.byId.get('71-43-2')!);
  const screens = defaultScreens();
  screens.risk = {
    form: { ...screens.risk.form, chemicals: [{ ...rec, conc: { groundwater: '0.005' } }] },
  };
  screens.uncertainty = {
    ...screens.uncertainty,
    risk: {
      ...screens.uncertainty.risk,
      rows: {
        'exposure.receptor0.bw': {
          ...emptyRow(),
          kind: 'uniform',
          params: { a: '50', b: '100' },
        },
      },
      iterations: '30',
      seed: 'ui',
      sobol: true,
      sobolN: '16',
    },
  };
  return buildProject({ screens, createdWith: '0.0.1', now: new Date('2026-10-19T12:00:00Z') });
}

describe('ReportUncertainty', () => {
  it('runs nothing until the box is ticked, then shows the percentiles, indices, seed and count', async () => {
    const project = await projectWithSetup();
    render(<ReportUncertainty project={project} makeWorker={makeWorker} workers={1} />);
    const box = screen.getByLabelText(/include uncertainty results/i) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByLabelText('Exposure uncertainty results')).toBeNull();
    fireEvent.click(box);
    const out = await screen.findByLabelText(
      'Exposure uncertainty results',
      {},
      { timeout: 30000 },
    );
    expect(within(out).getByText('ui')).toBeTruthy();
    expect(within(out).getByText(/30 of 30 iterations ran/)).toBeTruthy();
    expect(within(out).getByText('5th percentile')).toBeTruthy();
    expect(within(out).getByText(/Sobol: N = 16/)).toBeTruthy();
    // Every chart carries its table open, with no toggle.
    expect(within(out).queryByRole('button', { name: /data table/i })).toBeNull();
    expect(out.querySelectorAll('figure').length).toBeGreaterThanOrEqual(4);
    expect(out.querySelectorAll('figure .table-view table').length).toBe(
      out.querySelectorAll('figure').length,
    );
    // Unticking removes the results.
    fireEvent.click(box);
    await waitFor(() => expect(screen.queryByLabelText('Exposure uncertainty results')).toBeNull());
  }, 60000);

  it('shows the protective cleanup levels of the cleanup panel with its seed', async () => {
    const db = await loadChemicalDb();
    const screens = defaultScreens();
    screens.cleanup = {
      form: { ...screens.cleanup.form, chemicals: [newChemicalRow(db.byId.get('71-43-2')!)] },
    };
    screens.uncertainty = {
      ...screens.uncertainty,
      cleanup: {
        ...screens.uncertainty.cleanup,
        rows: {
          'exposure.receptor0.bw': {
            ...emptyRow(),
            kind: 'uniform',
            params: { a: '50', b: '100' },
          },
        },
        iterations: '30',
        seed: 'cl',
      },
    };
    const project = buildProject({
      screens,
      createdWith: '0.0.1',
      now: new Date('2026-10-19T12:00:00Z'),
    });
    render(<ReportUncertainty project={project} makeWorker={makeWorker} workers={1} />);
    fireEvent.click(screen.getByLabelText(/include uncertainty results/i));
    const out = await screen.findByLabelText(
      'Probabilistic cleanup results',
      {},
      { timeout: 30000 },
    );
    expect(within(out).getByText('cl')).toBeTruthy();
    expect(within(out).getByRole('table', { name: 'Protective cleanup levels' })).toBeTruthy();
    expect(within(out).getByText(/\(chosen\)/)).toBeTruthy();
  }, 60000);

  it('says there is nothing to run when no input has a distribution', async () => {
    const screens = defaultScreens();
    const project = buildProject({
      screens,
      createdWith: '0.0.1',
      now: new Date('2026-10-19T12:00:00Z'),
    });
    render(<ReportUncertainty project={project} makeWorker={makeWorker} workers={1} />);
    fireEvent.click(screen.getByLabelText(/include uncertainty results/i));
    expect(await screen.findByText(/nothing to run/i)).toBeTruthy();
  });
});
