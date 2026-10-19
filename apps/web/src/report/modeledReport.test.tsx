import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { applyToxOverrides } from '../overrides/toxicity';
import { buildProject, defaultScreens, overridesOf, screensOf, type Screens } from '../project';
import {
  clearModeledSummary,
  modeledFingerprint,
  setModeledSummary,
} from '../cleanup/modeledSummary';
import type { ModeledUncertaintySummary } from '../cleanup/modeledSummary';
import { defaultCleanupForm } from '../cleanup/form';
import { buildModeled } from '../cleanup/modeledBuild';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { clearTransportFeed, getTransportFeed, setTransportFeed } from '../transport/chainFeed';
import { DEFAULT_FORM, toScenario } from '../transport/form';
import { withProjectReceptorEdits } from './userValues';
import { modeledReportEntry } from './modeledReport';
import { planUncertainty } from './uncertaintyReport';
import { UncertaintyReportView } from './UncertaintyResults';

const NOW = new Date('2026-10-19T12:00:00.000Z');
let db: ChemicalDb;

beforeAll(async () => {
  db = await loadChemicalDb();
}, 60000);

afterEach(() => {
  clearModeledSummary();
  clearTransportFeed();
});

function useChain(): void {
  const t = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!t.ok) throw new Error(t.errors.join('; '));
  setTransportFeed({ scenario: t.scenario, label: 'test aquifer' });
}

function modeledScreens(edit: (s: Screens) => void = () => {}): Screens {
  const f = defaultCleanupForm();
  const on: PathwayId[] = ['waterIngestion', 'waterDermal'];
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const s = defaultScreens();
  s.cleanup = {
    form: {
      ...f,
      chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
      a: { ...f.a, pathways },
      source: 'dissolved',
    },
  };
  edit(s);
  return s;
}

const projectOf = (s: Screens) => buildProject({ screens: s, createdWith: '0.0.1', now: NOW });

/** The fingerprint the cleanup screen would record for this project and the live chain. */
function fingerprintOf(project: ReturnType<typeof projectOf>): string {
  const screens = withProjectReceptorEdits(screensOf(project), overridesOf(project));
  const built = buildModeled(screens.cleanup.form, applyToxOverrides(db, overridesOf(project)), {
    transport: getTransportFeed(),
    vadose: null,
    saturated: null,
  });
  if (!built.ok) throw new Error(built.errors.join('; '));
  return modeledFingerprint(built.request, screens.uncertainty.modeled);
}

const summary = (fingerprint: string): ModeledUncertaintySummary => ({
  fingerprint,
  label: 'Benzene at the source, Wexler (1992)',
  unit: 'mg/L',
  fromSi: 1000,
  deterministic: 2e-3,
  n: 200,
  succeeded: 198,
  seed: 'k7',
  forwardRuns: 1234,
  workers: 2,
  chosen: 0.95,
  levels: [
    { p: 0.5, level: 3e-3 },
    { p: 0.9, level: 2e-3 },
    { p: 0.95, level: 1e-3 },
  ],
  warnings: [{ code: 'uncertainty.small-sample-tail', message: 'few draws below the level' }],
  spearman: [{ label: 'Seepage velocity', rho: -0.42 }],
});

describe('modeledReportEntry', () => {
  it('says nothing for a direct source', () => {
    const screens = defaultScreens();
    expect(modeledReportEntry(screens, db)).toBeNull();
  });

  it('says no run exists when a modeled source has none', () => {
    useChain();
    expect(modeledReportEntry(modeledScreens(), db)).toEqual({ state: 'none' });
  });

  it('holds the summary as current while the inputs match what it was computed from', () => {
    useChain();
    const project = projectOf(modeledScreens());
    const s = summary(fingerprintOf(project));
    setModeledSummary(s);
    const screens = withProjectReceptorEdits(screensOf(project), overridesOf(project));
    expect(modeledReportEntry(screens, db)).toEqual({ state: 'current', summary: s });
  });

  it('flags the summary out of date when a cleanup input changes', () => {
    useChain();
    const was = fingerprintOf(projectOf(modeledScreens()));
    setModeledSummary(summary(was));
    const changed = modeledScreens((s) => {
      s.cleanup = { form: { ...s.cleanup.form, targetRisk: '1e-5' } };
    });
    expect(modeledReportEntry(changed, db)?.state).toBe('stale');
  });

  it('flags it out of date when the uncertainty setup or seed changes', () => {
    useChain();
    const was = fingerprintOf(projectOf(modeledScreens()));
    setModeledSummary(summary(was));
    const changed = modeledScreens((s) => {
      s.uncertainty = {
        ...s.uncertainty,
        modeled: { ...s.uncertainty.modeled, seed: 'another' },
      };
    });
    expect(modeledReportEntry(changed, db)?.state).toBe('stale');
  });

  it('flags it out of date when the chain it was computed through is gone', () => {
    useChain();
    const was = fingerprintOf(projectOf(modeledScreens()));
    setModeledSummary(summary(was));
    clearTransportFeed();
    expect(modeledReportEntry(modeledScreens(), db)?.state).toBe('stale');
  });
});

describe('planUncertainty with a modeled source', () => {
  it('carries the entry, so a modeled source with no run says to run it on the cleanup screen', async () => {
    useChain();
    const plan = await planUncertainty(projectOf(modeledScreens()));
    expect(plan.modeled).toEqual({ state: 'none' });
    expect(plan.exposure).toBeNull();
    expect(plan.cleanup).toBeNull();
  });

  it('has no modeled entry for a direct source', async () => {
    const plan = await planUncertainty(projectOf(defaultScreens()));
    expect(plan.modeled).toBeNull();
  });
});

describe('UncertaintyReportView, modeled source', () => {
  const runs = (modeled: ReturnType<typeof modeledReportEntry>) => ({
    exposure: null,
    cleanup: null,
    modeled,
  });

  it('prints the summary labeled as computed on the cleanup screen, with iterations and seed', () => {
    render(<UncertaintyReportView runs={runs({ state: 'current', summary: summary('x') })} />);
    const out = screen.getByLabelText('Modeled source uncertainty results');
    expect(out.textContent).toMatch(/computed on the cleanup screen/i);
    expect(within(out).getByText('k7')).toBeTruthy();
    expect(out.textContent).toMatch(/198 of 200 iterations/);
    const table = within(out).getByRole('table', { name: 'Protective cleanup levels' });
    expect(table.textContent).toMatch(/95 percent \(chosen\)/);
    expect(table.textContent).toMatch(/mg\/L/);
    expect(out.textContent).toMatch(/uncertainty\.small-sample-tail/);
    expect(out.textContent).toMatch(/deterministic cleanup level is\s*2/i);
  });

  it('says a stale result is out of date and to re-run it, without printing its numbers', () => {
    render(<UncertaintyReportView runs={runs({ state: 'stale', summary: summary('x') })} />);
    const out = screen.getByLabelText('Modeled source uncertainty results');
    expect(out.textContent).toMatch(/out of date/i);
    expect(out.textContent).toMatch(/re-run it on the cleanup screen/i);
    expect(within(out).queryByRole('table')).toBeNull();
  });

  it('says to run it on the cleanup screen when no run exists', () => {
    render(<UncertaintyReportView runs={runs({ state: 'none' })} />);
    const out = screen.getByLabelText('Modeled source uncertainty results');
    expect(out.textContent).toMatch(/no run yet/i);
    expect(out.textContent).toMatch(/run it on the cleanup screen/i);
  });
});
