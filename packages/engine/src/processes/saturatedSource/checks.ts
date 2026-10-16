export function finite(name: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite, got ${x}`);
}
export function nonNeg(name: string, x: number): void {
  finite(name, x);
  if (x < 0) throw new RangeError(`${name} must not be negative, got ${x}`);
}
export function pos(name: string, x: number): void {
  finite(name, x);
  if (!(x > 0)) throw new RangeError(`${name} must be positive, got ${x}`);
}
