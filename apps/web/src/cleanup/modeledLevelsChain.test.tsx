import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { clearTransportFeed, setTransportFeed, type TransportFeed } from '../transport/chainFeed';
import { toScenario } from '../transport/form';
import { REGRESSION_FORM } from '../transport/regression.testkit';
import {
  forgetMemory,
  getChainHash,
  getModeledLevels,
  getScreen,
  newProject,
  setScreen,
} from '../project/store';
import { defaultCleanupForm, type CleanupForm } from './form';
import { chainFingerprint, modeledLevelsFingerprint } from './modeledLevels';
import { fakeOutcome } from './modeledLevels.testkit';
import type { ModeledRequest } from './modeledTypes';
import type { ModeledSolved } from './ModeledCleanup';
import { useSaveModeledLevels } from './useSaveModeledLevels';

const X = '1330-20-7';
const Y = '108-88-3';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

afterEach(() => {
  cleanup();
  clearTransportFeed();
  forgetMemory();
  newProject();
});

const REQ = { marker: 'req' } as unknown as ModeledRequest;

function chainFor(chemicalId: string, K: string): TransportFeed {
  const r = toScenario({ ...REGRESSION_FORM, timeYr: '10', K });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { scenario: r.scenario, label: `aquifer for ${chemicalId}`, chemicalId };
}

/** The groundwater screen is set to a chemical (picking it rewrites Kd, as the screen does) and sends its run. */
function sendChain(chemicalId: string, patch: Record<string, string>, kd: string): void {
  const t = getScreen('transport');
  act(() => {
    setScreen('transport', {
      ...t,
      form: { ...t.form, chemicalId, kd, retardMode: 'kd', ...patch },
    } as never);
  });
  act(() => setTransportFeed(chainFor(chemicalId, patch['K'] ?? t.form.K)));
}

function formFor(ids: string[]): CleanupForm {
  return {
    ...defaultCleanupForm(),
    source: 'dissolved',
    chemicals: ids.map((id) => newChemicalRow(db.byId.get(id)!)),
  };
}

function hookFor(id: string) {
  const form = formFor([X, Y]);
  const row = form.chemicals.find((c) => c.id === id)!;
  const rows = [{ id, name: row.name, result: { ok: true as const, request: REQ, notes: [] } }];
  const mk = (): ReadonlyMap<string, ModeledSolved> =>
    new Map([
      [id, { req: REQ, item: { ok: true, outcome: fakeOutcome('groundwater', { modern: 0.5 }) } }],
    ]) as never;
  const props = (solved: ReadonlyMap<string, ModeledSolved>) => ({
    form,
    db,
    rows,
    solved,
    feedsOf: (_id: string) => ({
      transport: null as TransportFeed | null,
      vadose: null,
      saturated: null,
    }),
  });
  return { form, props, mk };
}

describe('the kept modeled levels follow the chemical own groundwater run', () => {
  it('records the fingerprint of the run each chemical was sent with', () => {
    sendChain(X, { K: '10' }, '0.5');
    const hX = chainFingerprint(getScreen('transport').form);
    expect(getChainHash(X)).toBe(hX);
    sendChain(Y, { K: '10' }, '3');
    expect(getChainHash(X)).toBe(hX);
    expect(getChainHash(Y)).toBe(chainFingerprint(getScreen('transport').form));
    expect(getChainHash(Y)).not.toBe(hX);
  });

  it('keeps the fingerprint when another chemical is picked on the groundwater screen (Kd changes)', () => {
    sendChain(X, { K: '10' }, '0.5');
    const hX = chainFingerprint(getScreen('transport').form);
    const { form, props, mk } = hookFor(X);
    const fp = modeledLevelsFingerprint({
      cleanup: form,
      chemicalId: X,
      chain: hX,
      vadose: null,
      saturated: null,
      rec: db.byId.get(X),
      edition: db.edition,
    });
    const feed = chainFor(X, '10');
    const p = props(mk());
    const withFeed = { ...p, feedsOf: () => ({ transport: feed, vadose: null, saturated: null }) };
    const { rerender } = renderHook((a) => useSaveModeledLevels(a), { initialProps: withFeed });
    expect(getModeledLevels()[X]!.fingerprint).toBe(fp);
    // the screen is set to the other chemical: Kd and the chemical differ from the run X was sent with
    const t = getScreen('transport');
    act(() =>
      setScreen('transport', { ...t, form: { ...t.form, chemicalId: Y, kd: '3.3' } } as never),
    );
    rerender({ ...withFeed, solved: mk() });
    expect(getModeledLevels()[X]!.fingerprint).toBe(fp);
  }, 30000);

  it('does not stamp levels solved from the old run with a site edit made while another chemical was active', () => {
    sendChain(X, { K: '10' }, '0.5');
    const hX = chainFingerprint(getScreen('transport').form);
    const { form, props, mk } = hookFor(X);
    const fp = modeledLevelsFingerprint({
      cleanup: form,
      chemicalId: X,
      chain: hX,
      vadose: null,
      saturated: null,
      rec: db.byId.get(X),
      edition: db.edition,
    });
    const feed = chainFor(X, '10');
    const withFeed = {
      ...props(mk()),
      feedsOf: () => ({ transport: feed, vadose: null, saturated: null }),
    };
    const { rerender } = renderHook((a) => useSaveModeledLevels(a), { initialProps: withFeed });
    expect(getModeledLevels()[X]!.fingerprint).toBe(fp);
    // the site changes (velocity through K) while Y is active, and only Y's run is sent again
    sendChain(Y, { K: '99' }, '3');
    expect(getChainHash(X)).toBe(hX);
    rerender({ ...withFeed, solved: mk() });
    // the entry still describes the run it was solved from, never the edited screen
    expect(getModeledLevels()[X]!.fingerprint).toBe(fp);
    expect(getModeledLevels()[X]!.fingerprint).not.toBe(
      modeledLevelsFingerprint({
        cleanup: form,
        chemicalId: X,
        chain: chainFingerprint(getScreen('transport').form),
        vadose: null,
        saturated: null,
        rec: db.byId.get(X),
        edition: db.edition,
      }),
    );
  }, 30000);

  it('keeps nothing when the project holds no record of the run it was solved from', () => {
    const { props, mk } = hookFor(X);
    const feed = chainFor(X, '10');
    const withFeed = {
      ...props(mk()),
      feedsOf: () => ({ transport: feed, vadose: null, saturated: null }),
    };
    renderHook((a) => useSaveModeledLevels(a), { initialProps: withFeed });
    expect(getModeledLevels()[X]).toBeUndefined();
  }, 30000);
});
