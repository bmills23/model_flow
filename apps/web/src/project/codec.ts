/**
 * Feed values go into the project file as JSON. Plain JSON turns a non-finite number into null, and
 * a scenario can hold one (an open-ended loading term ends at infinity), so those are written as a
 * tagged object and read back exactly. Undefined fields are dropped, as JSON does.
 */
const TAG = '$nonfinite';

export function encodeJson(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { [TAG]: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (Array.isArray(value)) return value.map((v) => encodeJson(v ?? null));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = encodeJson(v);
    }
    return out;
  }
  return value;
}

export function decodeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeJson);
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 1 && keys[0] === TAG) {
      const t = rec[TAG];
      if (t === 'NaN') return NaN;
      if (t === 'Infinity') return Infinity;
      if (t === '-Infinity') return -Infinity;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = decodeJson(v);
    return out;
  }
  return value;
}
