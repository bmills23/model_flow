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
  | 'eco'
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
