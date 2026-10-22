import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { inlineWorkerFactory } from '../uncertainty/dispatch';
import type { WorkerLike } from '../uncertainty/pool';
import { computeModeled } from './compute';
import { defaultCleanupForm } from './form';
import { buildModeled } from './modeledBuild';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';
import { ModeledSourceUncertainty } from './ModeledSourceUncertainty';
import { clearModeledSummary, getModeledSummary, modeledFingerprint } from './modeledSummary';
import { getScreen } from '../project/store';

let db: ChemicalDb;
let req: ModeledRequest;
let outcome: ModeledOutcome;

beforeAll(async () => {
  db = await loadChemicalDb();
  const t = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!t.ok) throw new Error(t.errors.join('; '));
  const f = defaultCleanupForm();
  const on: PathwayId[] = ['waterIngestion', 'waterDermal'];
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const r = buildModeled(
    {
      ...f,
      chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
      a: { ...f.a, pathways },
      source: 'dissolved',
    },
    db,
    { transport: { scenario: t.scenario, label: 'test aquifer' }, vadose: null, saturated: null },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  req = r.request;
  outcome = computeModeled(req);
}, 120000);

const runButton = () => screen.getByRole('button', { name: /run probabilistic cleanup/i });

function sampleVelocity() {
  const row = screen.getByRole('group', { name: /seepage velocity/i });
  fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
  fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '5' } });
  fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '40' } });
}

function panel(over: Partial<Parameters<typeof ModeledSourceUncertainty>[0]> = {}) {
  return (
    <ModeledSourceUncertainty
      request={req}
      outcome={outcome}
      name="Benzene"
      makeWorker={inlineWorkerFactory()}
      workers={1}
      {...over}
    />
  );
}

describe('ModeledSourceUncertainty', () => {
  it('offers the transport and receptor inputs of the chosen method, with a modeled default count', () => {
    render(panel());
    const region = screen.getByRole('region', { name: /probabilistic cleanup level, modeled/i });
    expect(within(region).getByRole('group', { name: /seepage velocity/i })).toBeTruthy();
    expect(within(region).getByRole('group', { name: /body weight/i })).toBeTruthy();
    const velocity = within(region).getByRole('group', { name: /seepage velocity/i });
    fireEvent.change(within(velocity).getByLabelText(/distribution/i), {
      target: { value: 'uniform' },
    });
    expect(within(velocity).getByLabelText(/minimum \(m\/yr\)/i)).toBeTruthy();
    expect((screen.getByLabelText(/iterations/i) as HTMLInputElement).placeholder).toBe('200');
    expect((runButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/transport method/i), { target: { value: 'modern' } });
    expect(within(region).queryByRole('group', { name: /body weight/i })).toBeNull();
    expect(within(region).getByRole('group', { name: /seepage velocity/i })).toBeTruthy();
  });

  it('runs on the pool and reports the levels, charts and the small-sample warning', async () => {
    render(panel());
    fireEvent.change(screen.getByLabelText(/transport method/i), { target: { value: 'legacy' } });
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    fireEvent.click(runButton());
    const table = await screen.findByRole(
      'table',
      { name: /protective cleanup levels/i },
      { timeout: 60000 },
    );
    expect(within(table).getAllByRole('row').length).toBe(4);
    expect(table.textContent).toMatch(/mg\/L/);
    expect(screen.getByText(/uncertainty\.small-sample-tail/)).toBeTruthy();
    expect(screen.getByText(/1 worker/)).toBeTruthy();
    expect(screen.getByText(/deterministic cleanup level/i)).toBeTruthy();
  }, 120000);

  it('keeps a summary of a finished run for the report, with the fingerprint it was computed from', async () => {
    clearModeledSummary();
    render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    expect(getModeledSummary()).toBeNull();
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i }, { timeout: 60000 });
    const s = getModeledSummary();
    expect(s).not.toBeNull();
    expect(s!.n).toBe(6);
    expect(s!.levels).toHaveLength(3);
    expect(s!.label).toMatch(/Benzene at the source/);
    expect(s!.fingerprint).toBe(modeledFingerprint(req, getScreen('uncertainty').modeled));
    expect(JSON.stringify(s)).not.toContain('iterationLevels');
  }, 120000);

  it('keeps no summary for a cancelled run', async () => {
    clearModeledSummary();
    render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '40' } });
    fireEvent.click(runButton());
    fireEvent.click(screen.getByRole('button', { name: /cancel run/i }));
    await screen.findByText(/the run was cancelled/i);
    expect(getModeledSummary()).toBeNull();
  }, 120000);

  it('drops the earlier summary when a cancelled re-run clears the screen result', async () => {
    clearModeledSummary();
    const { rerender } = render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i }, { timeout: 60000 });
    expect(getModeledSummary()).not.toBeNull();
    rerender(panel({ request: { ...req } }));
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '40' } });
    fireEvent.click(runButton());
    fireEvent.click(screen.getByRole('button', { name: /cancel run/i }));
    await screen.findByText(/the run was cancelled/i);
    expect(screen.queryByRole('table', { name: /protective cleanup levels/i })).toBeNull();
    expect(getModeledSummary()).toBeNull();
  }, 120000);

  it('drops the earlier summary when a failed re-run clears the screen result', async () => {
    clearModeledSummary();
    const { rerender } = render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i }, { timeout: 60000 });
    expect(getModeledSummary()).not.toBeNull();
    const failing = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage() {
          setTimeout(() => w.onerror?.({ message: 'worker exploded' }), 0);
        },
        terminate() {},
      };
      return w;
    };
    rerender(panel({ makeWorker: failing }));
    fireEvent.click(runButton());
    await screen.findByText(/worker exploded/i, undefined, { timeout: 60000 });
    expect(screen.queryByRole('table', { name: /protective cleanup levels/i })).toBeNull();
    expect(getModeledSummary()).toBeNull();
  }, 120000);

  it('marks the results stale when the request changes after a run', async () => {
    const { rerender } = render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i }, { timeout: 60000 });
    rerender(panel({ request: { ...req, windowSeconds: req.windowSeconds + 1 } }));
    expect(screen.getByText(/inputs changed after this run/i)).toBeTruthy();
  }, 120000);

  it('does not mark the results stale for an equal request that is a new object', async () => {
    const { rerender } = render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '6' } });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i }, { timeout: 60000 });
    rerender(panel({ request: structuredClone(req) }));
    expect(screen.queryByText(/inputs changed after this run/i)).toBeNull();
    expect(screen.getByRole('table', { name: /protective cleanup levels/i })).toBeTruthy();
  }, 120000);

  it('cancels a running probabilistic run when the panel unmounts', async () => {
    let terminated = 0;
    const counting: Parameters<typeof panel>[0] = {
      makeWorker: () => {
        const w: WorkerLike = {
          onmessage: null,
          onerror: null,
          postMessage() {},
          terminate() {
            terminated += 1;
          },
        };
        return w;
      },
    };
    clearModeledSummary();
    const { unmount } = render(panel(counting));
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '40' } });
    fireEvent.click(runButton());
    await screen.findByRole('button', { name: /cancel run/i });
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(terminated).toBeGreaterThan(0);
    expect(getModeledSummary()).toBeNull();
  }, 120000);

  it('can be cancelled while it runs', async () => {
    render(panel());
    sampleVelocity();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '40' } });
    fireEvent.click(runButton());
    fireEvent.click(screen.getByRole('button', { name: /cancel run/i }));
    expect(await screen.findByText(/the run was cancelled/i)).toBeTruthy();
    expect(screen.queryByRole('table', { name: /protective cleanup levels/i })).toBeNull();
  }, 120000);

  it('will not run while the screen solves a newer request', () => {
    render(panel({ pending: true }));
    sampleVelocity();
    expect((runButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/waiting for the level above/i)).toBeTruthy();
  });

  it('says so when no method solved', () => {
    render(panel({ outcome: { medium: 'groundwater' } }));
    expect(screen.getByText(/once the level above is solved/i)).toBeTruthy();
  });
});
