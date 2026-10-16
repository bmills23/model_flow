import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { TPH_CONSTANT_THRESHOLD } from '../vadose/index.js';
import { finite, nonNeg, pos } from './checks.js';
import {
  checkGeometry,
  sourceInitialMass,
  waterLevels,
  type SourceGeometry,
  type WaterLevels,
} from './geometry.js';
import {
  regionConcentrations,
  type RegionConcentrations,
  type RegionState,
  type SaturatedChemical,
  type SaturatedSoil,
} from './partitioning.js';
import {
  makeReleaseSchedule,
  regionRates,
  YEAR_SECONDS,
  type FluctuationSchedule,
  type RegionRates,
  type ReleaseSchedule,
} from './release.js';

export * from './geometry.js';
export * from './partitioning.js';
export * from './release.js';
export * from './coupling.js';
export { TPH_CONSTANT_THRESHOLD };

const MONTH = YEAR_SECONDS / 12;

export interface SaturatedSourceInput {
  source: SourceGeometry & { schedule?: FluctuationSchedule };
  soil: SaturatedSoil;
  /** Aquifer hydraulic conductivity (m/s) and gradient (m/m); Darcy flux U = K i. */
  aquifer: { conductivity: number; gradient: number };
  /** Infiltration (Darcy flux), m/s. */
  infiltration: number;
  chemical: SaturatedChemical;
  /** Optional first-order source decay, 1/s (modern method only; default 0). */
  sourceDecayRate?: number;
  /** Horizon of the series and the mass budget, s. */
  tEnd: number;
}

export interface SaturatedSourceOutput {
  methodId: string;
  exponent: 0 | 1;
  /** Chemical mass in the source at t = 0, kg. */
  initialMass: number;
  /** Time the source is exhausted, s (Infinity when nothing is released, and for the modern method). */
  depletionTime: number;
  levels: { hLo: number; hHi: number; capped: boolean };
  regions: { unsaturated: RegionState | null; saturated: RegionState | null };
  /** Release rates at low and high water and their annual mean, kg/s. */
  rates: RegionRates;
  /** Modern: exponential decline constant Qbar / M0 + lambda_s, 1/s. */
  gamma?: number;
  schedule: ReleaseSchedule;
  /** Monthly nodes up to tEnd: times (s), release rate (kg/s), cumulative delivered and remaining (kg). */
  series: { times: number[]; rate: number[]; delivered: number[]; remaining: number[] };
  budget: { initial: number; remaining: number; delivered: number; decayed: number };
  warnings: Warning[];
}

type Method = 'legacy' | 'modern';

interface Prepared {
  levels: WaterLevels;
  regions: RegionConcentrations;
  rates: RegionRates;
  initialMass: number;
  kind: FluctuationSchedule;
  decay: number;
}

function check(input: SaturatedSourceInput, method: Method): FluctuationSchedule {
  checkGeometry(input.source);
  pos('aquifer.conductivity', input.aquifer.conductivity);
  nonNeg('aquifer.gradient', input.aquifer.gradient);
  nonNeg('infiltration', input.infiltration);
  finite('tEnd', input.tEnd);
  if (input.tEnd < 0) throw new RangeError(`tEnd must not be negative, got ${input.tEnd}`);
  const decay = input.sourceDecayRate ?? 0;
  nonNeg('sourceDecayRate', decay);
  if (method === 'legacy' && decay > 0) {
    throw new RangeError(
      'the legacy two-region method has no source decay; use the exponential method',
    );
  }
  const kind = input.source.schedule ?? 'annual-mean';
  if (kind !== 'annual-mean' && kind !== 'seasonal') {
    throw new RangeError(`unknown fluctuation schedule "${String(kind)}"`);
  }
  return kind;
}

function prepare(input: SaturatedSourceInput, method: Method): Prepared {
  const kind = check(input, method);
  const levels = waterLevels(input.source);
  const regions = regionConcentrations({
    soil: input.soil,
    chemical: input.chemical,
    conductivity: input.aquifer.conductivity,
    infiltration: input.infiltration,
    unsaturatedExists: levels.unsatLo > 0,
    saturatedExists: levels.hHi > 0,
    onClamp: method === 'legacy' ? 'clamp' : 'throw',
  });
  const rates = regionRates({
    levels,
    regions,
    length: input.source.length,
    width: input.source.width,
    fractionHigh: input.source.fractionHigh,
    darcyFlux: input.aquifer.conductivity * input.aquifer.gradient,
  });
  const initialMass = sourceInitialMass({
    F: input.chemical.F,
    rhoB: input.soil.rhoB,
    thickness: input.source.thickness,
    length: input.source.length,
    width: input.source.width,
  });
  return { levels, regions, rates, initialMass, kind, decay: input.sourceDecayRate ?? 0 };
}

const mgL = (c: number): string => `${(c * 1e3).toPrecision(4)} mg/L`;

function warningsFor(input: SaturatedSourceInput, p: Prepared, method: Method): Warning[] {
  const out: Warning[] = [];
  const names: [string, RegionState | null][] = [
    ['region 1 (above the water table)', p.regions.unsaturated],
    ['region 2 (below the water table)', p.regions.saturated],
  ];
  for (const [name, r] of names) {
    if (r?.residual) {
      out.push({
        code: 'saturatedSource.residual-phase',
        message: `A separate phase is present in ${name}: mole fraction x = ${r.x.toPrecision(4)}, effective solubility x S = ${mgL(r.effS)}, equilibrium pore water without a separate phase ${mgL(r.ceq)}; its pore water is held at x S.`,
      });
    }
  }
  const { FT, F } = input.chemical;
  if (FT !== undefined && F / FT > TPH_CONSTANT_THRESHOLD) {
    out.push({
      code: 'saturatedSource.tph-constant-approximation',
      message: `The chemical is ${(100 * (F / FT)).toPrecision(3)} percent of the TPH mass, above ${100 * TPH_CONSTANT_THRESHOLD} percent; holding the TPH mass constant as the chemical depletes understates the decline of the mole fraction by up to that fraction.`,
    });
  }
  if (method === 'legacy') {
    const { low, high } = p.rates;
    const contributes1 = low.q1 > 0 || high.q1 > 0;
    const contributes2 = low.q2 > 0 || high.q2 > 0;
    const dissolved =
      (contributes1 && p.regions.unsaturated?.residual === false) ||
      (contributes2 && p.regions.saturated?.residual === false);
    if (dissolved) {
      out.push({
        code: 'saturatedSource.constant-dissolved-source',
        message:
          'A contributing region holds no separate phase, so its pore-water concentration would fall as the chemical is removed; the legacy method holds it constant until the mass is exhausted, which overstates the late release. The exponential method declines with the mass left.',
      });
    }
  }
  if (p.levels.capped) {
    out.push({
      code: 'saturatedSource.fluctuation-capped',
      message: `The minimum saturated thickness plus the fluctuation exceeds the source thickness (${input.source.thickness} m); the high-water saturated thickness is capped at the source thickness.`,
    });
  }
  if (method === 'legacy' && p.regions.clamped) {
    out.push({
      code: 'saturatedSource.infiltration-clamped',
      message:
        'Infiltration exceeds the aquifer hydraulic conductivity; it is reduced to the conductivity and region 1 is saturated (RISC5 choice).',
    });
  }
  if (p.rates.low.q1 + p.rates.low.q2 === 0 && p.rates.high.q1 + p.rates.high.q2 === 0) {
    out.push({
      code: 'saturatedSource.no-release',
      message:
        'The release rate is zero at both water levels (no infiltration through an unsaturated part and no flow through a submerged part), so no mass reaches the aquifer.',
    });
  }
  return out;
}

function buildSeries(schedule: ReleaseSchedule, tEnd: number): SaturatedSourceOutput['series'] {
  const times: number[] = [];
  const n = Math.floor((tEnd / MONTH) * (1 + 1e-12));
  for (let k = 0; k <= n; k++) times.push(k * MONTH);
  if (times[times.length - 1]! < tEnd * (1 - 1e-12)) times.push(tEnd);
  else times[times.length - 1] = tEnd;
  return {
    times,
    rate: times.map((t) => schedule.rate(t)),
    delivered: times.map((t) => schedule.delivered(t)),
    remaining: times.map((t) => schedule.remaining(t)),
  };
}

function run(input: SaturatedSourceInput, method: Method): SaturatedSourceOutput {
  const p = prepare(input, method);
  const exponent = method === 'legacy' ? 0 : 1;
  const schedule = makeReleaseSchedule({
    exponent,
    kind: p.kind,
    initialMass: p.initialMass,
    low: p.rates.low,
    high: p.rates.high,
    fractionHigh: input.source.fractionHigh,
    sourceDecayRate: p.decay,
  });
  const delivered = schedule.delivered(input.tEnd);
  const decayed = schedule.decayed(input.tEnd);
  const out: SaturatedSourceOutput = {
    methodId: method === 'legacy' ? 'saturatedSource.two-region' : 'saturatedSource.exponential',
    exponent,
    initialMass: p.initialMass,
    depletionTime: schedule.depletionTime,
    levels: { hLo: p.levels.hLo, hHi: p.levels.hHi, capped: p.levels.capped },
    regions: { unsaturated: p.regions.unsaturated, saturated: p.regions.saturated },
    rates: p.rates,
    schedule,
    series: buildSeries(schedule, input.tEnd),
    budget: {
      initial: p.initialMass,
      remaining: schedule.remaining(input.tEnd),
      delivered,
      decayed,
    },
    warnings: warningsFor(input, p, method),
  };
  if (method === 'modern') {
    out.gamma = (p.initialMass > 0 ? p.rates.mean / p.initialMass : 0) + p.decay;
  }
  return out;
}

/** Legacy two-region source: constant release until the mass is exhausted. */
export function runTwoRegion(input: SaturatedSourceInput): SaturatedSourceOutput {
  return run(input, 'legacy');
}

/** Modern source: release proportional to the mass left (exponential decline). */
export function runExponential(input: SaturatedSourceInput): SaturatedSourceOutput {
  return run(input, 'modern');
}

const ASSUMPTIONS = [
  'One homogeneous soil for the source and the aquifer; one porosity serves partitioning and transport.',
  'Equilibrium partitioning and instantaneous dissolution; Raoult law for a separate phase, tested per chemical and per region; no NAPL migration.',
  'One well-mixed pool of chemical shared by region 1 (above the water table, flushed by infiltration) and region 2 (below it, flushed by groundwater flow).',
  'Region 1 leachate reaches the aquifer immediately and undiluted; its rate does not depend on the thickness of region 1, only on whether region 1 exists.',
  'The water-table fluctuation changes only how the source is split between the two regions, not the flow field; the default releases at the annual mean rate.',
  'Volatilization from region 1 is not a loss term.',
  'The source starts at t = 0 with its measured concentration; the TPH mass is held constant.',
];

const CITATIONS_LEGACY = [
  'feenstra1991',
  'epa1996ssg',
  'brookscorey1964',
  'lenhard1989',
  'vangenuchten1980',
  'mualem1976',
];

export const saturatedTwoRegion: MethodDescriptor<SaturatedSourceInput, SaturatedSourceOutput> = {
  id: 'saturatedSource.two-region',
  process: 'saturatedSource',
  kind: 'legacy',
  name: 'Two-region saturated soil source, constant until exhausted',
  summary:
    'A soil source at the water table split into a region above (flushed by infiltration) and a region below (flushed by groundwater flow), each at its equilibrium pore-water concentration or the Raoult effective solubility, releasing a constant mass rate until the shared pool of chemical is exhausted.',
  citations: CITATIONS_LEGACY,
  assumptions: ASSUMPTIONS,
  risc5Choice:
    'RISC5 applies the residual-phase comparison to each chemical alone, delivers region 1 leachate to the aquifer undiluted and at once at a rate independent of region 1 thickness, takes region 1 moisture from a unit-gradient Brooks-Corey curve (n entered for the soil) with the aquifer conductivity as Ks, reduces infiltration above K to K, holds each region concentration constant until the pool is empty, uses one porosity for partitioning and transport, and leaves volatilization from region 1 out of the mass balance.',
  validate: (input) => warningsFor(input, prepare(input, 'legacy'), 'legacy'),
  run: runTwoRegion,
};

export const saturatedExponential: MethodDescriptor<SaturatedSourceInput, SaturatedSourceOutput> = {
  id: 'saturatedSource.exponential',
  process: 'saturatedSource',
  kind: 'modern',
  name: 'Two-region saturated soil source, mass-consistent exponential decline',
  summary:
    'The same two-region source with pore-water concentrations proportional to the mass left, so the release declines exponentially: the first-order source of BIOSCREEN and the unit-exponent member of the Falta et al. source-strength family, with an optional first-order source decay.',
  citations: [...CITATIONS_LEGACY, 'newell1996', 'falta2005'],
  assumptions: [
    ...ASSUMPTIONS,
    'Pore-water concentration scales with the mass left, with and without a separate phase, so the residual-phase outcome does not change as the source depletes.',
  ],
  validate: (input) => warningsFor(input, prepare(input, 'modern'), 'modern'),
  run: runExponential,
};
