import { toScenario as toTransport, type Scenario } from '../transport/form';
import { REGRESSION_FORM as TRANSPORT_FORM } from '../transport/regression.testkit';
import { R7_FORM, toScenario as toVadose } from '../vadose/form';
import type { VadoseFeed } from '../vadose/feed';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';
import type { SaturatedFeed } from '../saturated/feed';
import { compute, type SwResult } from '../surfaceWater/compute';
import { DEFAULT_FORM, toRequest, type SwForm, type SwRequest } from '../surfaceWater/inputs';

/** Request, vadose and saturated sources the surface water level solves are tested on. */
const v = toVadose(R7_FORM);
if (!v.ok) throw new Error('vadose scenario');
export const vadoseScenario = v.scenario;
export const vadoseFeed: VadoseFeed = {
  scenario: vadoseScenario,
  method: 'legacy',
  label: 'Table R-7 validation case',
};

const sat = toSaturated(SAT_FORM);
if (!sat.ok) throw new Error('saturated scenario');
export const saturatedFeed: SaturatedFeed = {
  input: sat.scenario.input,
  method: 'legacy',
  label: 'Case A saturated source',
};

const strip = (s: Scenario): Omit<Scenario, 'zOf'> => {
  const { zOf: _z, ...rest } = s;
  void _z;
  return rest;
};

export function unlinkedRequest(over: Partial<SwForm> = {}): SwRequest {
  const r = toRequest({ ...DEFAULT_FORM, ...over }, null);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

/** A surface water request linked to a typed-source transport run. */
export function linkedRequest(over: Partial<SwForm> = {}, timeYr = '5'): SwRequest {
  const s = toTransport({ ...TRANSPORT_FORM, timeYr });
  if (!s.ok) throw new Error(s.errors.join('; '));
  const r = toRequest(
    { ...DEFAULT_FORM, linked: true, bankX: '50', ...over },
    { scenario: strip(s.scenario), label: 'run' },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

/** A surface water request linked to a transport run fed by the vadose or saturated source screen. */
export function fedRequest(
  kind: 'vadose' | 'saturated' = 'vadose',
  over: Partial<SwForm> = {},
  timeYr = '12',
): SwRequest {
  const s =
    kind === 'vadose'
      ? toTransport({ ...TRANSPORT_FORM, feedFromVadose: true, timeYr }, vadoseFeed)
      : toTransport({ ...TRANSPORT_FORM, feedFromSaturated: true, timeYr }, null, saturatedFeed);
  if (!s.ok) throw new Error(s.errors.join('; '));
  const r = toRequest(
    { ...DEFAULT_FORM, linked: true, bankX: '50', ...over },
    { scenario: strip(s.scenario), label: 'run' },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

export function run(req: SwRequest): SwResult {
  const out = compute(req);
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

export const peakOf = (r: SwResult, method: 'well-mixed' | 'mass-discharge'): number =>
  Math.max(...(method === 'well-mixed' ? r.legacy.surfaceWater : r.modern.surfaceWater));
