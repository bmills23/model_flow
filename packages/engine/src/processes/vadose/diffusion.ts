export interface MoistureState {
  thetaS: number;
  /** Volumetric water content under the infiltration rate. */
  theta: number;
}

export interface DiffusionChemical {
  /** Diffusion coefficient in air, m^2/s. */
  Da: number;
  /** Diffusion coefficient in water, m^2/s. */
  Dw: number;
  /** Dimensionless Henry's constant (> 0). */
  H: number;
}

/**
 * Millington-Quirk effective vapour diffusion coefficient referred to the gas concentration:
 * [Da thetaA^(10/3) + (Dw / H) theta^(10/3)] / thetaS^2.
 */
export function millingtonQuirkDeff(layer: MoistureState, chem: DiffusionChemical): number {
  const { thetaS, theta } = layer;
  if (!Number.isFinite(thetaS) || !(thetaS > 0 && thetaS <= 1)) {
    throw new RangeError(`thetaS must be in (0, 1], got ${thetaS}`);
  }
  if (!Number.isFinite(theta) || theta < 0 || theta > thetaS) {
    throw new RangeError(`theta must be in [0, thetaS], got ${theta}`);
  }
  if (!Number.isFinite(chem.Da) || chem.Da < 0) throw new RangeError('Da must be >= 0');
  if (!Number.isFinite(chem.Dw) || chem.Dw < 0) throw new RangeError('Dw must be >= 0');
  if (!Number.isFinite(chem.H) || !(chem.H > 0)) throw new RangeError('H must be > 0');
  const thetaA = thetaS - theta;
  return (
    (chem.Da * Math.pow(thetaA, 10 / 3) + (chem.Dw / chem.H) * Math.pow(theta, 10 / 3)) /
    (thetaS * thetaS)
  );
}

export interface DiffusionSegment {
  /** Thickness, m. */
  h: number;
  /** Effective diffusion coefficient, m^2/s. */
  deff: number;
}

/** Overall coefficient for layers in series: sum(h) / sum(h / deff). */
export function seriesDeff(layers: readonly DiffusionSegment[]): number {
  if (layers.length === 0) throw new RangeError('seriesDeff needs at least one layer');
  let h = 0;
  let r = 0;
  for (const l of layers) {
    if (!Number.isFinite(l.h) || !(l.h > 0))
      throw new RangeError(`layer thickness must be > 0, got ${l.h}`);
    if (!Number.isFinite(l.deff) || !(l.deff > 0)) {
      throw new RangeError(`layer deff must be > 0, got ${l.deff}`);
    }
    h += l.h;
    r += l.h / l.deff;
  }
  return h / r;
}
