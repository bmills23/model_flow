import { finite, nonNeg, pos } from './checks.js';

/** Source dimensions and water-table fluctuation, SI (m, fraction of the year). */
export interface SourceGeometry {
  /** Plan length (along the flow) and width, m. */
  length: number;
  width: number;
  /** Total thickness H_s, m. */
  thickness: number;
  /** Minimum saturated thickness h_min (low water), m. */
  minSaturatedThickness: number;
  /** Fluctuation height dh, m. */
  fluctuation: number;
  /** Fraction of the year at high water. */
  fractionHigh: number;
}

export interface WaterLevels {
  /** Saturated thickness at low and high water, m. */
  hLo: number;
  hHi: number;
  /** True when h_min + dh exceeds the source thickness, so hHi was capped at H_s. */
  capped: boolean;
  /** Unsaturated thickness at low and high water, m. */
  unsatLo: number;
  unsatHi: number;
}

/** Validate the geometry inputs (RangeError on any violation). */
export function checkGeometry(g: SourceGeometry): void {
  pos('source.length', g.length);
  pos('source.width', g.width);
  pos('source.thickness', g.thickness);
  finite('source.minSaturatedThickness', g.minSaturatedThickness);
  if (g.minSaturatedThickness < 0 || g.minSaturatedThickness > g.thickness) {
    throw new RangeError(
      `minimum saturated thickness must be in [0, ${g.thickness}], got ${g.minSaturatedThickness}`,
    );
  }
  nonNeg('source.fluctuation', g.fluctuation);
  finite('source.fractionHigh', g.fractionHigh);
  if (g.fractionHigh < 0 || g.fractionHigh > 1) {
    throw new RangeError(
      `fraction of the year at high water must be in [0, 1], got ${g.fractionHigh}`,
    );
  }
}

/** Saturated and unsaturated thickness of the source at low and high water. */
export function waterLevels(g: SourceGeometry): WaterLevels {
  checkGeometry(g);
  const hLo = g.minSaturatedThickness;
  const raw = hLo + g.fluctuation;
  const capped = raw > g.thickness;
  const hHi = capped ? g.thickness : raw;
  return { hLo, hHi, capped, unsatLo: g.thickness - hLo, unsatHi: g.thickness - hHi };
}

/** Chemical mass in the source, kg: F rho_b H_s L W. */
export function sourceInitialMass(p: {
  F: number;
  rhoB: number;
  thickness: number;
  length: number;
  width: number;
}): number {
  nonNeg('F', p.F);
  pos('rhoB', p.rhoB);
  pos('thickness', p.thickness);
  pos('length', p.length);
  pos('width', p.width);
  return p.F * p.rhoB * p.thickness * p.length * p.width;
}
