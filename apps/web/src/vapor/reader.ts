/** Reads the text boxes of a form as numbers, collecting every field that fails. */
export class Reader {
  errors: string[] = [];
  num(
    raw: string,
    label: string,
    rule: 'pos' | 'nonneg' | 'any' | 'frac' | 'fracpos' = 'pos',
  ): number {
    const t = raw.trim();
    const v = t === '' ? NaN : Number(t);
    if (!Number.isFinite(v)) {
      this.errors.push(`${label} must be a number`);
      return NaN;
    }
    if (rule === 'pos' && !(v > 0)) this.errors.push(`${label} must be greater than 0`);
    if (rule === 'nonneg' && v < 0) this.errors.push(`${label} must not be negative`);
    if (rule === 'frac' && !(v >= 0 && v <= 1)) this.errors.push(`${label} must be from 0 to 1`);
    if (rule === 'fracpos' && !(v > 0 && v <= 1))
      this.errors.push(`${label} must be above 0, at most 1`);
    return v;
  }
  optional(raw: string, label: string): number | undefined {
    return raw.trim() === '' ? undefined : this.num(raw, label);
  }
}
