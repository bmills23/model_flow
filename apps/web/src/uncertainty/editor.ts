import {
  cholesky,
  checkDistribution,
  distributionCdf,
  convertDistributionUnits,
  distributionQuantile,
  lognormalFromArithmetic,
  type Distribution,
  type UncertainInput,
} from '@model-flow/engine';

/**
 * Pure logic behind the distribution editor and the correlation matrix input (M10 slice W2).
 * Text fields in, SI distributions out; every refusal is a sentence the form can show.
 */

export type RowKind = 'point' | Distribution['kind'];
export type LognormalForm = 'geometric' | 'arithmetic';

export interface DistRow {
  /** 'point' leaves the input at its deterministic value (not sampled). */
  kind: RowKind;
  /** Parameter text by key, see PARAM_FIELDS. */
  params: Record<string, string>;
  lnForm: LognormalForm;
  /** Truncation limits as entered; blank means none. */
  lo: string;
  hi: string;
  /** Empirical table: one "value probability" pair per line. */
  table: string;
}

export function emptyRow(): DistRow {
  return { kind: 'point', params: {}, lnForm: 'geometric', lo: '', hi: '', table: '' };
}

export interface ParamField {
  key: string;
  label: string;
}

export const KIND_OPTIONS: readonly { value: RowKind; label: string }[] = [
  { value: 'point', label: 'Point value (not sampled)' },
  { value: 'constant', label: 'Constant' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'loguniform', label: 'Log-uniform' },
  { value: 'triangular', label: 'Triangular' },
  { value: 'normal', label: 'Normal' },
  { value: 'lognormal', label: 'Lognormal' },
  { value: 'empirical', label: 'Empirical' },
];

export function paramFields(kind: RowKind, form: LognormalForm): ParamField[] {
  switch (kind) {
    case 'constant':
      return [{ key: 'value', label: 'Value' }];
    case 'uniform':
    case 'loguniform':
      return [
        { key: 'a', label: 'Minimum' },
        { key: 'b', label: 'Maximum' },
      ];
    case 'triangular':
      return [
        { key: 'a', label: 'Minimum' },
        { key: 'mode', label: 'Mode' },
        { key: 'b', label: 'Maximum' },
      ];
    case 'normal':
      return [
        { key: 'mean', label: 'Mean' },
        { key: 'sd', label: 'Standard deviation' },
      ];
    case 'lognormal':
      return form === 'geometric'
        ? [
            { key: 'gm', label: 'Geometric mean' },
            { key: 'gsd', label: 'Geometric standard deviation' },
          ]
        : [
            { key: 'mean', label: 'Arithmetic mean' },
            { key: 'sd', label: 'Arithmetic standard deviation' },
          ];
    default:
      return [];
  }
}

function num(text: string | undefined, label: string): number | string {
  const t = (text ?? '').trim();
  if (t === '') return `${label} is empty`;
  const v = Number(t);
  return Number.isFinite(v) ? v : `${label} is not a number`;
}

export type BuildResult = { ok: true; dist: Distribution | null } | { ok: false; error: string };

function parseTable(text: string): { values: number[]; probs: number[] } | string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2)
    return 'The empirical table needs at least two lines of value and probability';
  const values: number[] = [];
  const probs: number[] = [];
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/[\s,;]+/).filter((p) => p !== '');
    const v = Number(parts[0]);
    const p = Number(parts[1]);
    if (parts.length !== 2 || !Number.isFinite(v) || !Number.isFinite(p)) {
      return `Empirical table line ${i + 1} must be a value and a cumulative probability`;
    }
    values.push(v);
    probs.push(p);
  }
  return { values, probs };
}

/** Build the SI distribution from a row; `factor` multiplies entered values into SI. */
export function buildDistribution(row: DistRow, factor: number): BuildResult {
  if (row.kind === 'point') return { ok: true, dist: null };
  const fields = paramFields(row.kind, row.lnForm);
  const v: Record<string, number> = {};
  for (const f of fields) {
    const r = num(row.params[f.key], f.label);
    if (typeof r === 'string') return { ok: false, error: r };
    v[f.key] = r;
  }
  let base: Distribution;
  switch (row.kind) {
    case 'constant':
      base = { kind: 'constant', value: v.value as number };
      break;
    case 'uniform':
    case 'loguniform':
      base = { kind: row.kind, a: v.a as number, b: v.b as number };
      break;
    case 'triangular':
      base = { kind: 'triangular', a: v.a as number, mode: v.mode as number, b: v.b as number };
      break;
    case 'normal':
      base = { kind: 'normal', mean: v.mean as number, sd: v.sd as number };
      break;
    case 'lognormal':
      if (row.lnForm === 'geometric') {
        base = { kind: 'lognormal', gm: v.gm as number, gsd: v.gsd as number };
      } else {
        if (!((v.mean as number) > 0) || !((v.sd as number) > 0)) {
          return { ok: false, error: 'Arithmetic mean and standard deviation must be positive' };
        }
        base = lognormalFromArithmetic(v.mean as number, v.sd as number);
      }
      break;
    case 'empirical': {
      const t = parseTable(row.table);
      if (typeof t === 'string') return { ok: false, error: t };
      base = { kind: 'empirical', values: t.values, probs: t.probs };
      break;
    }
  }
  const trunc: { lo?: number; hi?: number } = {};
  if (row.lo.trim() !== '') {
    const r = num(row.lo, 'Lower truncation');
    if (typeof r === 'string') return { ok: false, error: r };
    trunc.lo = r;
  }
  if (row.hi.trim() !== '') {
    const r = num(row.hi, 'Upper truncation');
    if (typeof r === 'string') return { ok: false, error: r };
    trunc.hi = r;
  }
  const withTrunc = { ...base, ...trunc } as Distribution;
  // The geometric mean of a lognormal is a location, so a lognormal entered with a unit factor
  // keeps its gsd (convertDistributionUnits scales gm only), and arithmetic moments are
  // converted to SI before the lognormal parameters are derived.
  return { ok: true, dist: convertDistributionUnits(withTrunc, factor) };
}

export interface CurvePoint {
  x: number;
  p: number;
}

/** CDF preview: n points on a grid spanning the 0.1th to 99.9th percentile (or the truncation limits). */
export function cdfCurve(d: Distribution, n = 80): CurvePoint[] {
  const out: CurvePoint[] = [];
  if (d.kind === 'constant') {
    const w = Math.abs(d.value) * 0.1 || 1;
    for (let i = 0; i < n; i++) {
      const x = d.value - w + (2 * w * i) / (n - 1);
      out.push({ x, p: x < d.value ? 0 : 1 });
    }
    return out;
  }
  const x0 = d.lo ?? distributionQuantile(d, 0.001);
  const x1 = d.hi ?? distributionQuantile(d, 0.999);
  const logScale = (d.kind === 'lognormal' || d.kind === 'loguniform') && x0 > 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = logScale
      ? Math.exp(Math.log(x0) + (Math.log(x1) - Math.log(x0)) * t)
      : x0 + (x1 - x0) * t;
    out.push({ x: i === n - 1 ? x1 : x, p: distributionCdf(d, i === n - 1 ? x1 : x) });
  }
  return out;
}

export interface CorrelationBuild {
  ok: boolean;
  correlation: { ids: string[]; matrix: number[][] } | undefined;
  issues: string[];
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Build the target rank correlation over the ids that appear in a nonzero pair. Entries are keyed by
 * pairKey; blank or zero means independent. Refuses out-of-range, non-numeric and not positive
 * definite matrices (the Cholesky of the matrix must succeed, as the sampler requires).
 */
export function buildCorrelation(
  ids: readonly string[],
  entries: Readonly<Record<string, string>>,
  labels: Readonly<Record<string, string>> = {},
): CorrelationBuild {
  const issues: string[] = [];
  const set = new Set(ids);
  const pairs: { a: string; b: string; r: number }[] = [];
  for (const [key, text] of Object.entries(entries)) {
    const t = text.trim();
    if (t === '') continue;
    const [a, b] = key.split('|') as [string, string];
    if (!set.has(a) || !set.has(b)) continue;
    const name = `${labels[a] ?? a} and ${labels[b] ?? b}`;
    const r = Number(t);
    if (!Number.isFinite(r)) {
      issues.push(`The correlation of ${name} is not a number`);
      continue;
    }
    if (!(r > -1 && r < 1)) {
      issues.push(`The correlation of ${name} must be strictly between -1 and 1`);
      continue;
    }
    if (r !== 0) pairs.push({ a, b, r });
  }
  if (issues.length > 0) return { ok: false, correlation: undefined, issues };
  if (pairs.length === 0) return { ok: true, correlation: undefined, issues: [] };
  const used = ids.filter((id) => pairs.some((p) => p.a === id || p.b === id));
  const matrix = used.map((_, i) => used.map((__, j) => (i === j ? 1 : 0)));
  for (const p of pairs) {
    const i = used.indexOf(p.a);
    const j = used.indexOf(p.b);
    (matrix[i] as number[])[j] = p.r;
    (matrix[j] as number[])[i] = p.r;
  }
  if (cholesky(matrix) === null) {
    return {
      ok: false,
      correlation: undefined,
      issues: [
        'The correlation matrix is not positive definite; reduce the size of the correlations',
      ],
    };
  }
  return { ok: true, correlation: { ids: used, matrix }, issues: [] };
}

export interface EditorSpec {
  ok: boolean;
  /** SI distributions keyed by input id, in input order. */
  distributions: Record<string, Distribution>;
  correlation: { ids: string[]; matrix: number[][] } | undefined;
  /** Refusal sentences for the form. */
  issues: string[];
  /** Per input id, the issue for that row (for inline display). */
  rowIssues: Record<string, string>;
  /** The subset of `issues` that concerns the correlation matrix. */
  correlationIssues: string[];
}

/**
 * Combine the rows and the correlation entries into the distributions and correlation the E4
 * specification takes. `factors` maps an input id to its entered-unit-to-SI factor (default 1).
 */
export function buildEditorSpec(
  inputs: readonly UncertainInput<unknown>[],
  rows: Readonly<Record<string, DistRow>>,
  factors: Readonly<Record<string, number>>,
  entries: Readonly<Record<string, string>>,
): EditorSpec {
  const issues: string[] = [];
  const rowIssues: Record<string, string> = {};
  const distributions: Record<string, Distribution> = {};
  const labels: Record<string, string> = {};
  for (const u of inputs) {
    labels[u.id] = u.label;
    const row = rows[u.id];
    if (!row) continue;
    const built = buildDistribution(row, factors[u.id] ?? 1);
    if (!built.ok) {
      rowIssues[u.id] = built.error;
      issues.push(`${u.label}: ${built.error}`);
      continue;
    }
    if (built.dist === null) continue;
    const found = checkDistribution(built.dist, u.bounds);
    if (found.length > 0) {
      const msg = found.map((f) => f.message).join('; ');
      rowIssues[u.id] = msg;
      issues.push(`${u.label}: ${msg}`);
      continue;
    }
    distributions[u.id] = built.dist;
  }
  const corrIssues: string[] = [];
  const sampled = inputs.map((u) => u.id).filter((id) => id in distributions);
  const sampledSet = new Set(sampled);
  for (const [key, text] of Object.entries(entries)) {
    const t = text.trim();
    if (t === '' || Number(t) === 0) continue;
    const [a, b] = key.split('|') as [string, string];
    for (const id of [a, b]) {
      if (!sampledSet.has(id) && id in labels) {
        const msg = `${labels[id]} is in a correlation but has no valid distribution`;
        if (!corrIssues.includes(msg)) corrIssues.push(msg);
      } else if (distributions[id]?.kind === 'constant') {
        const msg = `${labels[id]} is a constant and cannot be correlated`;
        if (!corrIssues.includes(msg)) corrIssues.push(msg);
      }
    }
  }
  const corr = buildCorrelation(sampled, entries, labels);
  corrIssues.push(...corr.issues);
  issues.push(...corrIssues);
  return {
    ok: issues.length === 0,
    distributions,
    correlation: corr.correlation,
    issues,
    rowIssues,
    correlationIssues: corrIssues,
  };
}
