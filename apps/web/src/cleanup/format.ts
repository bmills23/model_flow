import type { Medium } from '@model-flow/engine';
import { FROM_SI } from './build';

/** A level in the screen unit with three figures; plain for ordinary sizes, scientific otherwise. */
export function fmtLevel(si: number | null, medium: Medium): string {
  if (si === null) return 'not quantified';
  const x = si * FROM_SI(medium);
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(3)));
}

/** A source level in SI times the factor to its screen unit, to three significant figures. */
export const fmtSource = (si: number | null, fromSi: number): string => {
  if (si === null) return 'not quantified';
  const x = si * fromSi;
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(3)));
};
