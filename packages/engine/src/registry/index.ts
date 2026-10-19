export type MethodKind = 'legacy' | 'modern';

export type ProcessId =
  | 'dispersivity'
  | 'vadose'
  | 'groundwater'
  | 'saturatedSource'
  | 'vapor'
  | 'outdoorAir'
  | 'shower'
  | 'particulate'
  | 'irrigation'
  | 'surfaceWater'
  | 'plantUptake'
  | 'exposure'
  | 'risk'
  | 'cleanup'
  | 'montecarlo';

export interface Warning {
  code: string;
  message: string;
}

export interface MethodDescriptor<I, O> {
  id: string;
  process: ProcessId;
  kind: MethodKind;
  name: string;
  summary: string;
  /** Keys into references.json; each must exist and be marked used. */
  citations: readonly string[];
  assumptions: readonly string[];
  /** What RISC5 does for this process, recorded for legacy/modern comparison. */
  risc5Choice?: string;
  validate?(input: I): Warning[];
  /** Inputs a Monte Carlo run may sample (uncertainty note, ruling 2). */
  uncertainInputs?: readonly UncertainInput<I>[];
  run(input: I): O;
}

export class MethodRegistry {
  private readonly methods = new Map<string, MethodDescriptor<unknown, unknown>>();

  register<I, O>(method: MethodDescriptor<I, O>): void {
    if (this.methods.has(method.id)) {
      throw new Error(`Method "${method.id}" is already registered`);
    }
    this.methods.set(method.id, method as unknown as MethodDescriptor<unknown, unknown>);
  }

  get(id: string): MethodDescriptor<unknown, unknown> {
    const found = this.methods.get(id);
    if (!found) throw new Error(`Unknown method "${id}"`);
    return found;
  }

  has(id: string): boolean {
    return this.methods.has(id);
  }

  list(process?: ProcessId, kind?: MethodKind): MethodDescriptor<unknown, unknown>[] {
    return [...this.methods.values()].filter(
      (m) =>
        (process === undefined || m.process === process) && (kind === undefined || m.kind === kind),
    );
  }
}

export interface UncertainInput<I> {
  /** Stable dotted path, for example 'exposure.receptor0.bw'. */
  id: string;
  label: string;
  /** SI unit of the value that get and set exchange. */
  unit: string;
  category: 'exposure' | 'transport' | 'site' | 'chemical';
  /** Physical support, inclusive. */
  bounds: readonly [number, number];
  get(input: I): number;
  /** Returns a new input; never mutates its argument. */
  set(input: I, value: number): I;
}

/**
 * Registry contract for a method's declarations: ids unique, set then get returns the value,
 * and set leaves the original input unchanged. Throws on the first violation.
 */
export function checkUncertainInputs<I>(
  inputs: readonly UncertainInput<I>[],
  base: I,
  probe: number,
): void {
  const seen = new Set<string>();
  for (const u of inputs) {
    if (seen.has(u.id)) throw new Error(`duplicate uncertain input id "${u.id}"`);
    seen.add(u.id);
    if (!(u.bounds[0] <= u.bounds[1])) throw new Error(`"${u.id}" has inverted bounds`);
    const before = u.get(base);
    const snapshot = JSON.stringify(base);
    const next = u.set(base, probe);
    if (JSON.stringify(base) !== snapshot || u.get(base) !== before) {
      throw new Error(`"${u.id}" set must not mutate its input`);
    }
    if (u.get(next) !== probe) throw new Error(`"${u.id}" set then get did not return the value`);
  }
}

/** Expose a link's inputs on a chain: ids gain the link prefix, accessors go through the link. */
export function prefixUncertainInputs<L, C>(
  prefix: string,
  inputs: readonly UncertainInput<L>[],
  getLink: (chain: C) => L,
  setLink: (chain: C, link: L) => C,
): UncertainInput<C>[] {
  return inputs.map((u) => ({
    ...u,
    id: `${prefix}.${u.id}`,
    get: (chain: C) => u.get(getLink(chain)),
    set: (chain: C, value: number) => setLink(chain, u.set(getLink(chain), value)),
  }));
}

export interface PathInputSpec<I> {
  id: string;
  label: string;
  unit: string;
  category: UncertainInput<I>['category'];
  bounds: readonly [number, number];
  /** Keys and array indices from the input root to the scalar. */
  path: readonly (string | number)[];
  /**
   * Guard for an input that exists only in one variant of a union (for example a Darcy discharge).
   * When it is false `get` reads NaN and `set` refuses.
   */
  when?: (input: I) => boolean;
}

function readPath(root: unknown, path: readonly (string | number)[]): number {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return Number.NaN;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return typeof cur === 'number' ? cur : Number.NaN;
}

function writePath(
  node: unknown,
  path: readonly (string | number)[],
  value: number,
  where: string,
): unknown {
  const [key, ...rest] = path as [string | number, ...(string | number)[]];
  if (node === null || typeof node !== 'object') {
    throw new RangeError(`"${where}" is not present in this input`);
  }
  if (Array.isArray(node)) {
    if (typeof key !== 'number' || key < 0 || key >= node.length) {
      throw new RangeError(`"${where}" is not present in this input`);
    }
    const copy = node.slice();
    copy[key] = rest.length === 0 ? value : writePath(node[key], rest, value, where);
    return copy;
  }
  const obj = node as Record<string | number, unknown>;
  if (rest.length > 0 && (obj[key] === undefined || obj[key] === null)) {
    throw new RangeError(`"${where}" is not present in this input`);
  }
  return { ...obj, [key]: rest.length === 0 ? value : writePath(obj[key], rest, value, where) };
}

/**
 * An uncertain input that is one scalar at a fixed path of the method input. An absent optional scalar
 * reads as NaN and is created by `set`; an absent parent, an array index past the end or a false guard
 * reads NaN and `set` throws a RangeError, so a sample is never silently dropped.
 */
export function pathInput<I>(spec: PathInputSpec<I>): UncertainInput<I> {
  const { path, when } = spec;
  return {
    id: spec.id,
    label: spec.label,
    unit: spec.unit,
    category: spec.category,
    bounds: spec.bounds,
    get: (input) => (when !== undefined && !when(input) ? Number.NaN : readPath(input, path)),
    set: (input, value) => {
      if (when !== undefined && !when(input)) {
        throw new RangeError(`"${spec.id}" is not present in this input`);
      }
      return writePath(input, path, value, spec.id) as I;
    },
  };
}
