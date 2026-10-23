import {
  formatReference,
  references as allReferences,
  registry as engineRegistry,
  type MethodKind,
  type MethodRegistry,
  type ProcessId,
  type Reference,
} from '@model-flow/engine';

/** The data editions a project is made against, as the directory names under packages/data/generated. */
export interface DataEditions {
  rsl?: string | undefined;
  nrwqc?: string | undefined;
  sediment?: string | undefined;
  /** The international criteria sets of the surface water screen; present only when one was chosen. */
  criteria?: string | undefined;
}
export type DataKind = keyof DataEditions;

/** Reference keys that source each dataset; the edition string comes from the project. */
export const DATA_SOURCES: Record<DataKind, { label: string; keys: readonly string[] }> = {
  rsl: { label: 'Regional Screening Levels, chemical and toxicity values', keys: ['epa2024rsl'] },
  nrwqc: {
    label: 'National Recommended Water Quality Criteria',
    keys: ['epanrwqc', 'epanrwqchh'],
  },
  sediment: { label: 'Sediment screening benchmarks', keys: ['epa2018r4era'] },
  // the keys are those of the set chosen (see StatementOptions.criteriaKeys)
  criteria: { label: 'International aquatic life and sediment criteria sets', keys: [] },
};

export interface StatementMethod {
  id: string;
  process: ProcessId;
  kind: MethodKind;
  name: string;
  summary: string;
  assumptions: string[];
  risc5Choice: string | undefined;
  /** Numbers into the reference list, in the order the descriptor cites them. */
  refs: number[];
}

export interface StatementReference {
  n: number;
  key: string;
  text: string;
}

export interface StatementData {
  kind: DataKind;
  label: string;
  edition: string;
  refs: number[];
}

export interface MethodsStatement {
  methods: StatementMethod[];
  references: StatementReference[];
  data: StatementData[];
}

export interface StatementOptions {
  /** Ids of the methods that were run; repeats are ignored. */
  methodIds: readonly string[];
  dataEditions?: DataEditions;
  /** Reference keys of the international criteria set(s) chosen; the `criteria` data source cites these. */
  criteriaKeys?: readonly string[];
  registry?: MethodRegistry;
  references?: readonly Reference[];
}

const DATA_ORDER: readonly DataKind[] = ['rsl', 'nrwqc', 'sediment', 'criteria'];

/**
 * The methods statement, generated from the registry and the reference list and never hand written:
 * each method that was run with its descriptor text, a reference list numbered by first appearance
 * and deduplicated across methods, and the data sources with their edition strings. An unknown
 * method id or reference key throws, so a statement never prints a gap.
 */
export function buildMethodsStatement(o: StatementOptions): MethodsStatement {
  const registry = o.registry ?? engineRegistry;
  const refList = o.references ?? allReferences;
  const byKey = new Map(refList.map((r) => [r.key, r]));
  const run = new Set(o.methodIds);
  for (const id of run) if (!registry.has(id)) throw new Error(`Unknown method "${id}"`);

  const numbers = new Map<string, number>();
  const printed: StatementReference[] = [];
  const cite = (key: string): number => {
    const known = numbers.get(key);
    if (known !== undefined) return known;
    const ref = byKey.get(key);
    if (!ref) throw new Error(`Unknown reference "${key}"`);
    const n = printed.length + 1;
    numbers.set(key, n);
    printed.push({ n, key, text: formatReference(ref) });
    return n;
  };

  const methods: StatementMethod[] = registry
    .list()
    .filter((m) => run.has(m.id))
    .map((m) => ({
      id: m.id,
      process: m.process,
      kind: m.kind,
      name: m.name,
      summary: m.summary,
      assumptions: [...m.assumptions],
      risc5Choice: m.risc5Choice,
      refs: m.citations.map(cite),
    }));

  const data: StatementData[] = [];
  for (const kind of DATA_ORDER) {
    const edition = o.dataEditions?.[kind];
    if (edition === undefined || edition === '') continue;
    const src = DATA_SOURCES[kind];
    const keys = kind === 'criteria' ? (o.criteriaKeys ?? []) : src.keys;
    if (kind === 'criteria' && keys.length === 0) continue;
    data.push({ kind, label: src.label, edition, refs: keys.map(cite) });
  }
  return { methods, references: printed, data };
}
