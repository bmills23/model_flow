import { convert } from '@model-flow/engine';
import type { RunInputRow } from '../project/runInputs';

const YR = convert(1, 'yr', 's');
/** kg/m3 to mg/L. */
const MG_PER_L = 1e3;
const sig = (x: number): number => Number(x.toPrecision(6));

/**
 * The aquifer, source and receptor a plume run carried, in the units the transport screen shows. Read
 * from the run's scenario (SI), so it describes exactly the run that produced the sent values. A source
 * fed by another screen is named as fed, with that run's label, and not as a typed strength.
 */
export function transportRunInputs(scenario: object): RunInputRow[] {
  const s = scenario as Record<string, unknown>;
  const num = (k: string): number | null => (typeof s[k] === 'number' ? (s[k] as number) : null);
  const out: RunInputRow[] = [];
  const add = (label: string, v: number | null, unit: string, scale = 1): void => {
    if (v !== null && Number.isFinite(v)) {
      out.push({ label, value: `${sig(v * scale)}${unit === '' ? '' : ` ${unit}`}` });
    }
  };
  add('Seepage velocity', num('velocity'), 'm/yr', YR);
  add('Porosity', num('porosity'), '');
  add('Retardation factor', num('retardation'), '');
  const decay = num('decayRate');
  out.push({
    label: 'Decay half-life',
    value: decay === null || decay <= 0 ? 'none' : `${sig(Math.LN2 / decay / YR)} yr`,
  });
  add('Longitudinal dispersivity', num('alphaL'), 'm');
  add('Transverse dispersivity', num('alphaT'), 'm');
  add('Vertical dispersivity', num('alphaV'), 'm');
  add('Source length along flow', num('srcLength'), 'm');
  add('Source width across flow', num('srcWidth'), 'm');
  add('Source thickness', num('srcDepth'), 'm');
  const fed = s['fed'] as { label?: string } | undefined;
  if (fed !== undefined && fed !== null) {
    out.push({
      label: 'Source',
      value: `fed by another screen's result (${fed.label ?? 'a sent run'})`,
    });
  } else {
    add('Source concentration', num('c0'), 'mg/L', MG_PER_L);
    add('Source mass release rate', num('massRate'), 'g/d', 1000 * 86400);
  }
  const rx = s['receptor'] as { x?: number; y?: number } | undefined;
  if (rx?.x !== undefined) add('Receptor distance downgradient', rx.x, 'm');
  if (rx?.y !== undefined) add('Receptor distance across flow', rx.y, 'm');
  const depths = s['receptorDepths'] as { top?: number; bottom?: number } | undefined;
  if (typeof depths?.top === 'number' && Number.isFinite(depths.top)) {
    const bottom = depths.bottom;
    out.push({
      label: 'Receptor depth below the water table',
      value:
        typeof bottom === 'number' && Number.isFinite(bottom) && bottom > depths.top
          ? `${sig(depths.top)} to ${sig(bottom)} m (screen average)`
          : `${sig(depths.top)} m`,
    });
  }
  add('Evaluation time', num('time'), 'yr', 1 / YR);
  return out;
}
