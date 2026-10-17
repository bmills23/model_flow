/** A toxicity value as the RSL prints it: plain for ordinary sizes, scientific for very small or large. */
export function fmtTox(x: number): string {
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e5)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(4)));
}
