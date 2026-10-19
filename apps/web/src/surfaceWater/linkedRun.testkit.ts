import { DEFAULT_FORM as TRANSPORT_FORM, toScenario } from '../transport/form';
import { compute } from './compute';
import { DEFAULT_FORM, toRequest } from './inputs';

/** A linked surface water run on the default 5-year transport scenario, shared by the plane-check test files. */
export const linkedRun = (over: Partial<typeof DEFAULT_FORM>) => {
  const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
  if (!s.ok) throw new Error('scenario');
  const { zOf: _z, ...scenario } = s.scenario;
  void _z;
  const r = toRequest(
    { ...DEFAULT_FORM, linked: true, bankX: '50', ...over },
    { scenario, label: 'test run' },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute(r.request);
  if (!out.ok) throw new Error(out.error);
  return out.result;
};
