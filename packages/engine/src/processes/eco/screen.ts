import type { Warning } from '../../registry/index.js';
import { checkNonNegative, checkPositive } from '../plantUptake/checks.js';
import { wildlifeHazardQuotient, type WildlifeDoseInput } from './wildlife.js';

export type EcoGroup = 'plants' | 'invertebrates' | 'avian' | 'mammalian';
export const ECO_GROUPS: readonly EcoGroup[] = ['plants', 'invertebrates', 'avian', 'mammalian'];

/** value: a number; NA: the document prints NA; NC: not enough data; procedure: no number, a procedure. */
export type SslStatus = 'value' | 'NA' | 'NC' | 'procedure';

export interface SslEntry {
  status: SslStatus;
  /** Eco-SSL, kg/kg dry weight; required when status is value. */
  value: number | null;
}

const screeningOnly = (): Warning => ({
  code: 'ECO_SCREENING_ONLY',
  message:
    'Eco-SSLs are screening values for Step 2 of the Superfund ecological process, not cleanup levels',
});

const noSsl = (group: string): Warning => ({
  code: 'ECO_NO_SSL',
  message: `no numeric Eco-SSL exists for this chemical and receptor group (${group})`,
});

const userBenchmark = (): Warning => ({
  code: 'ECO_BENCHMARK_USER_ENTERED',
  message: 'a legacy benchmark was entered by the user; its citation is the user’s responsibility',
});

export interface HqResult {
  hq: number | null;
  warnings: Warning[];
}

export function ecosslHazardQuotient(
  soil_kg_per_kg: number,
  ssl: SslEntry,
  group = 'group',
): HqResult {
  checkNonNegative('soil concentration', soil_kg_per_kg);
  if (ssl.status !== 'value') return { hq: null, warnings: [noSsl(group), screeningOnly()] };
  if (ssl.value === null) throw new RangeError('an Eco-SSL with status value needs a value');
  checkPositive('Eco-SSL', ssl.value);
  return { hq: soil_kg_per_kg / ssl.value, warnings: [screeningOnly()] };
}

export interface EcosslScreenInput {
  soil_kg_per_kg: number;
  /** All four groups are required; a document that prints NA is an entry with status NA. */
  ssl: Record<EcoGroup, SslEntry>;
}

export interface EcosslScreenResult {
  rows: { group: EcoGroup; hq: number | null }[];
  warnings: Warning[];
}

/** Hazard quotient per receptor group; always carries ECO_SCREENING_ONLY. A missing group throws. */
export function runEcosslScreen(input: EcosslScreenInput): EcosslScreenResult {
  const rows: EcosslScreenResult['rows'] = [];
  const warnings: Warning[] = [screeningOnly()];
  for (const group of ECO_GROUPS) {
    const entry = input.ssl[group];
    if (entry === undefined) throw new RangeError(`no Eco-SSL entry supplied for group ${group}`);
    const r = ecosslHazardQuotient(input.soil_kg_per_kg, entry, group);
    rows.push({ group, hq: r.hq });
    for (const w of r.warnings) if (w.code === 'ECO_NO_SSL') warnings.push(w);
  }
  return { rows, warnings };
}

export interface Benchmark {
  value_kg_per_kg: number;
  /** Reference key or free-text citation; required. */
  citation: string;
}

export function benchmarkHazardQuotient(soil_kg_per_kg: number, benchmark: Benchmark): HqResult {
  checkNonNegative('soil concentration', soil_kg_per_kg);
  checkPositive('benchmark', benchmark.value_kg_per_kg);
  if (benchmark.citation.trim() === '') throw new RangeError('a benchmark needs a citation');
  return { hq: soil_kg_per_kg / benchmark.value_kg_per_kg, warnings: [userBenchmark()] };
}

export interface BenchmarkScreenInput {
  soil_kg_per_kg: number;
  benchmarks: (Benchmark & { receptor: string })[];
  /** Wildlife receptors with a user-entered food web (user bioaccumulation factors as ratio models). */
  wildlife?: { receptor: string; food: WildlifeDoseInput }[];
}

export interface BenchmarkScreenResult {
  benchmarkRows: { receptor: string; citation: string; hq: number }[];
  wildlifeRows: { receptor: string; hq: number }[];
  warnings: Warning[];
}

export function runBenchmarkScreen(input: BenchmarkScreenInput): BenchmarkScreenResult {
  const benchmarkRows = input.benchmarks.map((b) => ({
    receptor: b.receptor,
    citation: b.citation,
    hq: benchmarkHazardQuotient(input.soil_kg_per_kg, b).hq as number,
  }));
  const wildlifeRows = (input.wildlife ?? []).map((w) => ({
    receptor: w.receptor,
    hq: wildlifeHazardQuotient(w.food, input.soil_kg_per_kg),
  }));
  const warnings = benchmarkRows.length > 0 ? [userBenchmark()] : [];
  return { benchmarkRows, wildlifeRows, warnings };
}
