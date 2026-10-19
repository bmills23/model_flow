type Plain = Record<string, unknown>;

const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A deep copy of plain JSON-like data (objects, arrays, primitives), so no live state is shared. */
export function cloneData<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => cloneData(x)) as T;
  if (isPlain(v)) {
    const out: Plain = {};
    for (const [k, x] of Object.entries(v)) out[k] = cloneData(x);
    return out as T;
  }
  return v;
}

/**
 * The defaults with every value the partial gives laid over them. Objects merge key by key, so a
 * file written before a field existed still loads; arrays, primitives and explicit nulls replace the
 * default whole. The result shares nothing with either argument.
 */
export function mergeDefaults<T>(defaults: T, partial: unknown): T {
  if (partial === undefined) return cloneData(defaults);
  if (isPlain(defaults) && isPlain(partial)) {
    const out: Plain = cloneData(defaults);
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) continue;
      out[k] = k in defaults ? mergeDefaults(defaults[k], v) : cloneData(v);
    }
    return out as T;
  }
  return cloneData(partial) as T;
}

/**
 * Paths of the keys present in `input` but absent from `output` (what a stripping parse dropped),
 * descending through objects and arrays. `base` is the path prefix.
 */
export function unknownKeyPaths(input: unknown, output: unknown, base: string): string[] {
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((v, i) => unknownKeyPaths(v, output[i], `${base}[${i}]`));
  }
  if (isPlain(input) && isPlain(output)) {
    return Object.entries(input).flatMap(([k, v]) =>
      k in output ? unknownKeyPaths(v, output[k], `${base}.${k}`) : [`${base}.${k}`],
    );
  }
  return [];
}
