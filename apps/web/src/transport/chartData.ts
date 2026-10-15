import { contours } from 'd3-contour';

export type ConcScale = 'linear' | 'log';

/** kg/m3 per mg/L is 1e-3, so a grid in kg/m3 times 1000 is mg/L. */
const MG_PER_L = 1e3;

/** Engine grid c[ix][iy] (kg/m3) to a row-major array in mg/L with x varying fastest. */
export function flattenGrid(c: readonly (readonly number[])[]): number[] {
  const nx = c.length;
  const ny = c[0]?.length ?? 0;
  const out = new Array<number>(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) out[j * nx + i] = c[i]![j]! * MG_PER_L;
  }
  return out;
}

const NICE = [1, 2, 5];

/** Contour levels, ascending, in the same units as the maximum (mg/L). */
export function contourLevels(max: number, scale: ConcScale): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [];
  if (scale === 'linear') {
    const raw = max / 8;
    const mag = 10 ** Math.floor(Math.log10(raw));
    let step = mag;
    for (const m of NICE) if (m * mag <= raw * (1 + 1e-12)) step = m * mag;
    const out: number[] = [];
    for (let k = 1; k * step < max * (1 - 1e-12); k++) out.push(Number((k * step).toPrecision(12)));
    return out;
  }
  const out: number[] = [];
  let decade = Math.floor(Math.log10(max));
  while (out.length < 8) {
    for (let k = NICE.length - 1; k >= 0 && out.length < 8; k--) {
      const v = Number((NICE[k]! * 10 ** decade).toPrecision(12));
      if (v <= max * (1 + 1e-12)) out.push(v);
    }
    decade -= 1;
  }
  return out.reverse();
}

/** Position on the colour ramp (0.15 pale to 1 full) for a level, linear or log in the level. */
export function colourFraction(level: number, levels: readonly number[], scale: ConcScale): number {
  const lo = levels[0]!;
  const hi = levels[levels.length - 1]!;
  if (levels.length < 2 || hi === lo) return 1;
  const f =
    scale === 'log'
      ? (Math.log10(level) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))
      : (level - lo) / (hi - lo);
  return 0.15 + 0.85 * f;
}

export interface ContourBand {
  level: number;
  d: string;
}

const fmt = (v: number): string => String(Number(v.toFixed(2)));

/**
 * Filled contour regions (value >= level) as SVG path data, one per level the data reaches. d3
 * places grid node (i, j) at (i + 0.5, j + 0.5); px and py map those coordinates to pixels.
 * On a log scale the contouring runs on log10 of the field so isolines follow decades.
 */
export function contourBands(
  values: readonly number[],
  nx: number,
  ny: number,
  levels: readonly number[],
  scale: ConcScale,
  px: (cx: number) => number,
  py: (cy: number) => number,
): ContourBand[] {
  if (levels.length === 0) return [];
  const field = scale === 'log' ? values.map((v) => Math.log10(Math.max(v, 1e-300))) : [...values];
  const thresholds = scale === 'log' ? levels.map((l) => Math.log10(l)) : [...levels];
  const generated = contours().size([nx, ny]).thresholds(thresholds)(field);
  const out: ContourBand[] = [];
  generated.forEach((mp, k) => {
    if (mp.coordinates.length === 0) return;
    let d = '';
    for (const polygon of mp.coordinates) {
      for (const ring of polygon) {
        ring.forEach(([cx, cy], idx) => {
          d += `${idx === 0 ? 'M' : 'L'}${fmt(px(cx!))},${fmt(py(cy!))}`;
        });
        d += 'Z';
      }
    }
    out.push({ level: levels[k]!, d });
  });
  return out;
}

/** Polyline path data that lifts the pen over non-finite points. */
export function linePath(points: readonly (readonly [number, number])[]): string {
  let d = '';
  let pen = false;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${fmt(x)},${fmt(y)}`;
    pen = true;
  }
  return d;
}

export function formatConcentration(v: number): string {
  if (v === 0 || !Number.isFinite(v)) return v === 0 ? '0' : String(v);
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 0.01) return String(Number(v.toPrecision(3)));
  return v.toExponential(2);
}
