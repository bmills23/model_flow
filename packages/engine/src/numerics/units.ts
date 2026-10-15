const LENGTH: Record<string, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  km: 1000,
  ft: 0.3048,
  in: 0.0254,
};
const TIME: Record<string, number> = { s: 1, min: 60, h: 3600, d: 86400, yr: 365.25 * 86400 };
const MASS: Record<string, number> = { kg: 1, g: 1e-3, mg: 1e-6, ug: 1e-9 };
const VOLUME: Record<string, number> = { m3: 1, L: 1e-3, mL: 1e-6, cm3: 1e-6 };

const TABLES: Record<string, Record<string, number>> = { L: LENGTH, T: TIME, M: MASS, V: VOLUME };

function simple(unit: string): { dim: string; factor: number } {
  for (const [dim, table] of Object.entries(TABLES)) {
    const factor = table[unit];
    if (factor !== undefined) return { dim, factor };
  }
  throw new RangeError(`unknown unit "${unit}"`);
}

function parse(unit: string): { dim: string; factor: number } {
  const parts = unit.split('/');
  const num = simple((parts[0] ?? '').trim());
  if (parts.length === 1) return num;
  if (parts.length !== 2) throw new RangeError(`cannot parse unit "${unit}"`);
  const den = simple((parts[1] ?? '').trim());
  return { dim: `${num.dim}/${den.dim}`, factor: num.factor / den.factor };
}

/**
 * Converts a value between units of the same dimension. Supports simple units and one-level
 * quotients such as "cm/yr" to "m/d". The engine works in SI internally and converts only at
 * its input and output boundaries.
 */
export function convert(value: number, from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  if (a.dim !== b.dim) {
    throw new RangeError(`incompatible units: "${from}" (${a.dim}) and "${to}" (${b.dim})`);
  }
  return (value * a.factor) / b.factor;
}
