import type { VaporOutcome } from './compute';

const MGM3 = 1e-6; // kg/m3 per mg/m3

export type VaporMethod = 'legacy' | 'modern' | 'devaull';

export interface ProfileCurve {
  method: VaporMethod;
  /** Height above the top of the source, m. */
  heights: number[];
  /** Vapor concentration, mg/m3. */
  values: number[];
}

/** The engine's vapor profile of each method that ran, unchanged but for the unit. */
export function profileCurves(out: VaporOutcome): ProfileCurve[] {
  const curves: ProfileCurve[] = [];
  for (const method of ['legacy', 'modern', 'devaull'] as const) {
    const o = out[method];
    if (!o?.ok) continue;
    curves.push({
      method,
      heights: o.result.profile.map((p) => p.height),
      values: o.result.profile.map((p) => p.concentration / MGM3),
    });
  }
  return curves;
}

export interface Band {
  name: string;
  /** Heights above the top of the source, m. */
  bottom: number;
  top: number;
}

/**
 * The strata the vapor crosses, as heights above the top of the source. Strata are listed from the
 * ground surface down; the part above the floor drops out and a stratum the floor cuts through keeps
 * the part below it. A capillary zone, when given, occupies the bottom of the column.
 */
export function layerBands(
  strata: readonly { thickness: number }[],
  names: readonly string[],
  floorDepth: number,
  capillary?: number,
): Band[] {
  const total = strata.reduce((s, l) => s + l.thickness, 0);
  const bands: Band[] = [];
  let depth = 0;
  strata.forEach((l, i) => {
    const hi = depth + l.thickness;
    const from = Math.max(depth, floorDepth);
    if (hi > floorDepth) {
      bands.push({
        name: names[i] ?? `Stratum ${i + 1}`,
        bottom: total - hi,
        top: total - from,
      });
    }
    depth = hi;
  });
  bands.reverse();
  if (capillary === undefined || !(capillary > 0)) return bands;
  const out: Band[] = [{ name: 'Capillary zone', bottom: 0, top: capillary }];
  for (const b of bands) {
    if (b.top <= capillary) continue;
    out.push({ ...b, bottom: Math.max(b.bottom, capillary) });
  }
  return out;
}
