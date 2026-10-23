import {
  boxConcentrationFromFlux,
  devaullRun,
  jeEpaIndoor,
  jeLegacyIndoor,
  sourceVapor,
  steadyDiffusionFlux,
  type DevaullInput,
  type EpaJeInput,
  type LegacyJeInput,
  type SourceVaporInput,
} from '@model-flow/engine';

/**
 * The forward model of a vapor air path, held on the vapor feed as plain JSON so the cleanup screen can
 * solve a source level for a path that is not linear in the source (wave V slice V2a). It is the engine
 * input of the method that produced the air (every number in SI) with the source left out, a template
 * that turns one source number into the engine's source, and the ceiling of the search. Nothing here
 * carries a model of its own: `forwardAir` calls the same engine functions the vapor screen ran.
 */

/** JSON with the non-finite numbers JSON cannot hold written as these strings. */
export type SiJson = null | boolean | number | string | SiJson[] | { [key: string]: SiJson };

const NON_FINITE: Record<string, number> = {
  Infinity: Infinity,
  '-Infinity': -Infinity,
  NaN: NaN,
};

/** A value as JSON-safe SI state: Infinity and NaN become strings, undefined keys are dropped. */
export function encodeSi(x: unknown): SiJson {
  if (typeof x === 'number') {
    return Number.isFinite(x) ? x : Number.isNaN(x) ? 'NaN' : x > 0 ? 'Infinity' : '-Infinity';
  }
  if (x === null || typeof x === 'boolean' || typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(encodeSi);
  if (typeof x === 'object') {
    const out: { [key: string]: SiJson } = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (v !== undefined) out[k] = encodeSi(v);
    }
    return out;
  }
  throw new TypeError(`cannot hold a ${typeof x} as SI state`);
}

/** The inverse of `encodeSi`. */
export function decodeSi(x: SiJson): unknown {
  if (typeof x === 'string') return x in NON_FINITE ? NON_FINITE[x] : x;
  if (Array.isArray(x)) return x.map(decodeSi);
  if (x !== null && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, decodeSi(v)]));
  }
  return x;
}

/** The medium a source is measured in: soil (kg/kg), or soil gas, groundwater or soil pore water (kg/m3). */
export type VaporSourceKind = 'soil' | 'soilGas' | 'groundwater' | 'poreWater';

/**
 * How one source number s (SI: kg/kg for soil, kg/m3 otherwise) becomes the engine's source: the template
 * with its `key` field set to `scale` times s. A soil gas template of a pore water source carries the
 * Henry constant as `scale`.
 */
export interface SourceTemplate {
  template: { [key: string]: SiJson };
  key: 'F' | 'csg' | 'cgw';
  scale: number;
}

/** The method that turns the source into air. */
export type VaporForward =
  | { kind: 'legacy' | 'modern' | 'devaull'; input: { [key: string]: SiJson } }
  | {
      /** The legacy box over the steady diffusion flux through the column of the legacy source vapor. */
      kind: 'box';
      column: SiJson;
      chemical: SiJson;
      box: { length: number; width: number; height: number; windSpeed: number };
    };

export interface VaporSolveSpec {
  /** The medium of the source the solve returns. */
  sourceKind: VaporSourceKind;
  forward: VaporForward;
  source: SourceTemplate;
  /** The largest source the model is run to: the solubility, saturation or residual-phase limit (SI). */
  cap?: { value: number; label: string };
}

const decoded = new WeakMap<object, unknown>();
function decodeOnce<T>(owner: object, x: SiJson): T {
  let v = decoded.get(owner);
  if (v === undefined) {
    v = decodeSi(x);
    decoded.set(owner, v);
  }
  return v as T;
}

function sourceOf(spec: VaporSolveSpec, s: number): SourceVaporInput {
  const t = decodeOnce<Record<string, unknown>>(spec.source, spec.source.template);
  return { ...t, [spec.source.key]: spec.source.scale * s } as unknown as SourceVaporInput;
}

/** The air concentration (kg/m3) the forward model gives for a source of `s` (SI). */
export function forwardAir(spec: VaporSolveSpec, s: number): number {
  const source = sourceOf(spec, s);
  const f = spec.forward;
  switch (f.kind) {
    case 'legacy':
      return jeLegacyIndoor({
        ...decodeOnce<Omit<LegacyJeInput, 'source'>>(f, f.input),
        source,
      } as LegacyJeInput).concentration;
    case 'modern':
      return jeEpaIndoor({
        ...decodeOnce<Omit<EpaJeInput, 'source'>>(f, f.input),
        source,
      } as EpaJeInput).concentration;
    case 'devaull':
      return devaullRun({
        ...decodeOnce<Omit<DevaullInput, 'source'>>(f, f.input),
        source,
      } as DevaullInput).concentration;
    case 'box': {
      const column = decodeOnce<Parameters<typeof steadyDiffusionFlux>[0]>(f, f.column);
      const chemical = decodeSi(f.chemical) as Parameters<typeof steadyDiffusionFlux>[1];
      const flux = steadyDiffusionFlux(column, chemical, sourceVapor(source).cvs);
      return boxConcentrationFromFlux(f.box, flux);
    }
  }
}
