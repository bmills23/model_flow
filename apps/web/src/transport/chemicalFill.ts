/** Digits kept in a derived Kd shown as text, so a product such as 0.8922000000000001 reads 0.8922. */
const KD_DIGITS = 8;

/**
 * Kd (L/kg) from the chemical's Koc (mL/g, which equals L/kg) times the organic carbon fraction, as the
 * text the Kd box holds. A chemical without a Koc, or a blank or non-numeric fraction, leaves `keep` as
 * typed.
 */
export function kdText(koc: number | undefined, foc: string, keep: string): string {
  const f = Number(foc);
  if (koc === undefined || foc.trim() === '' || !Number.isFinite(f)) return keep;
  const kd = koc * f;
  return Number.isFinite(kd) ? String(Number(kd.toPrecision(KD_DIGITS))) : String(kd);
}
