/** Validity checks shared by the plant uptake kernels (RangeError, never a silent fix). */

export interface PlantWarning {
  code: string;
  message: string;
}

export function checkFinite(label: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${label} must be finite`);
}

export function checkNonNegative(label: string, x: number): void {
  checkFinite(label, x);
  if (x < 0) throw new RangeError(`${label} must not be negative`);
}

export function checkPositive(label: string, x: number): void {
  checkFinite(label, x);
  if (x <= 0) throw new RangeError(`${label} must be positive`);
}

export const ionizableWarning = (): PlantWarning => ({
  code: 'PLANT_IONIZABLE',
  message: 'the chemical is ionizable at the soil pH; the neutral-organic model may be badly wrong',
});

export const inorganicWarning = (): PlantWarning => ({
  code: 'PLANT_INORGANIC_NEEDS_BCF',
  message:
    'an inorganic needs a user-entered bioconcentration factor; the plant concentration is not quantified',
});

export const logKowWarning = (range: string): PlantWarning => ({
  code: 'PLANT_LOGKOW_OUT_OF_RANGE',
  message: `log Kow is outside the range the regressions were fitted on (${range})`,
});
