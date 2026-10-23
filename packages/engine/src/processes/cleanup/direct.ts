import type { Warning } from '../../registry/index.js';
import { checkReceptorCount, checkUniqueChemicals } from '../exposure/checks.js';
import { legacyPathway, type LegacyChemical, type LegacyReceptor } from '../exposure/legacy.js';
import { modernPathway, type ModernChemical } from '../exposure/modern.js';
import { specialCaseWarnings } from '../exposure/receptorsModern.js';
import { isAgeSegmented, type ModernReceptor } from '../exposure/lifeStages.js';
import { assertAdditiveAllowed } from '../risk/additivity.js';
import { PATHWAYS, type Medium, type PathwayId } from '../exposure/units.js';
import {
  checkAllocationTargets,
  resolveConcentrationTarget,
  resolveRiskTargets,
  type Allocation,
  type ConcentrationTargetSpec,
  type Mcl,
  type RiskTargets,
} from './targets.js';

/**
 * Direct-pathway back-calculation (`docs/methods/cleanup-levels.md`, "Direct pathways: closed-form
 * inversion"). Every M4 pathway is linear in its EPC, so the cleanup level of a chemical in a source
 * medium is a division: the target over the summed coefficient of the medium's pathways. SI throughout
 * (kg/kg soil, kg/m^3 water and air); boundary conversion is the caller's.
 *
 * Cancer risks add over pathways, hazard quotients add over pathways within a noncancer group, and
 * groups are never added, so the noncancer denominator is the largest group's summed coefficient. A
 * route without a toxicity value contributes nothing; a chemical with nothing left has no risk-based
 * level (`null`, never zero or infinity). Each medium gets its own level from its own pathways.
 */

export interface DirectChemical<C> {
  id: string;
  chemical: C;
  /** Entered concentration per source medium, SI; the ratios drive the cumulative allocation. */
  entered?: Partial<Record<Medium, number>>;
  /** Groundwater only, individual allocation only: replaces the risk targets by a concentration. */
  concentrationTarget?: ConcentrationTargetSpec;
  /** The database MCL, used when the concentration target asks for it. */
  mcl?: Mcl;
  /** Solubility in water, kg/m^3, for the groundwater level warning. */
  solubility?: number;
  /**
   * The chemical is volatile (the engine holds no volatility data; the caller's database does). With an
   * inhalation toxicity value and no shower inhalation pathway on, a groundwater level warns that the
   * household-use inhalation term is omitted.
   */
  volatile?: boolean;
}

export interface DirectReceptor<R> {
  label: string;
  receptor: R;
  pathways: readonly PathwayId[];
  /** Legacy method only: route-to-route extrapolation of missing route values. */
  routeExtrapolation?: boolean;
}

export interface DirectInput<R, C> {
  /** One or two receptors. */
  receptors: readonly DirectReceptor<R>[];
  chemicals: readonly DirectChemical<C>[];
  targets?: RiskTargets;
  /** Default `individual`. */
  allocation?: Allocation;
  /** Legacy option: sum the two receptors' cancer coefficients (never their hazard quotients). */
  additive?: boolean;
}

export type Endpoint = 'cancer' | 'noncancer' | 'concentration';

export interface PathwayLevel {
  pathway: PathwayId;
  /** Level from this pathway alone (target over its coefficient); null without a value. */
  cancerLevel: number | null;
  noncancerLevel: number | null;
}

export interface ReceptorLevel {
  label: string;
  level: number | null;
  limiting: 'cancer' | 'noncancer' | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  noncancerGroup: string | null;
  byPathway: PathwayLevel[];
}

export interface DirectLevel {
  chemical: string;
  medium: Medium;
  /** The cleanup level (the lowest endpoint over receptors), SI; null when not quantified. */
  level: number | null;
  limiting: Endpoint | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  /** The noncancer group that limits (legacy: `total`). */
  noncancerGroup: string | null;
  /** The receptor whose endpoint limits (`a + b` for a legacy additive cancer limit). */
  limitingReceptor: string | null;
  byReceptor: ReceptorLevel[];
}

export interface DirectMediumResult {
  medium: Medium;
  allocation: Allocation;
  levels: DirectLevel[];
  /** Cumulative only: the common scale on the entered concentrations; null when nothing is quantified. */
  scale: number | null;
  scaleLimiting: 'cancer' | 'noncancer' | null;
}

export interface DirectResult {
  media: DirectMediumResult[];
  warnings: Warning[];
}

// ---------------------------------------------------------------- coefficients

interface Coef {
  computable: boolean;
  missing: string[];
  /** Cancer risk per unit EPC; null without a value. */
  a: number | null;
  /** Hazard quotient per unit EPC for each noncancer group; empty without a value. */
  b: Record<string, number>;
}

type CoefFn = (receptor: number, chemical: number, pathway: PathwayId) => Coef;

interface Agg {
  /** Summed cancer coefficient; 0 when no pathway has a value. */
  A: number;
  /** Summed coefficient per noncancer group. */
  B: Record<string, number>;
  maxB: number;
  maxGroup: string | null;
  pathways: { pathway: PathwayId; a: number; bmax: number; group: string | null }[];
}

function aggregate(coefs: { pathway: PathwayId; coef: Coef }[]): Agg {
  const agg: Agg = { A: 0, B: {}, maxB: 0, maxGroup: null, pathways: [] };
  for (const { pathway, coef } of coefs) {
    if (!coef.computable) continue;
    const a = coef.a ?? 0;
    agg.A += a;
    let bmax = 0;
    let group: string | null = null;
    for (const [g, v] of Object.entries(coef.b)) {
      agg.B[g] = (agg.B[g] ?? 0) + v;
      if (v > bmax) {
        bmax = v;
        group = g;
      }
    }
    agg.pathways.push({ pathway, a, bmax, group });
  }
  for (const [g, v] of Object.entries(agg.B)) {
    if (v > agg.maxB) {
      agg.maxB = v;
      agg.maxGroup = g;
    }
  }
  return agg;
}

const div = (target: number, coef: number): number | null => (coef > 0 ? target / coef : null);

function receptorLevel(label: string, agg: Agg, tr: number, thq: number): ReceptorLevel {
  const cancerLevel = div(tr, agg.A);
  const noncancerLevel = div(thq, agg.maxB);
  let level: number | null = null;
  let limiting: ReceptorLevel['limiting'] = null;
  if (cancerLevel !== null && (noncancerLevel === null || cancerLevel <= noncancerLevel)) {
    level = cancerLevel;
    limiting = 'cancer';
  } else if (noncancerLevel !== null) {
    level = noncancerLevel;
    limiting = 'noncancer';
  }
  return {
    label,
    level,
    limiting,
    cancerLevel,
    noncancerLevel,
    noncancerGroup: noncancerLevel === null ? null : agg.maxGroup,
    byPathway: agg.pathways.map((p) => ({
      pathway: p.pathway,
      cancerLevel: div(tr, p.a),
      noncancerLevel: div(thq, p.bmax),
    })),
  };
}

const minOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.min(...v);
};

/** Combines the receptors' levels of one chemical: the lowest, or the additive cancer coefficient. */
function combine(
  chemical: string,
  medium: Medium,
  recs: ReceptorLevel[],
  aggs: Agg[],
  tr: number,
  additive: boolean,
): DirectLevel {
  const cancerLevel = additive
    ? div(
        tr,
        aggs.reduce((s, a) => s + a.A, 0),
      )
    : minOf(recs.map((r) => r.cancerLevel));
  const ncs = recs.filter((r) => r.noncancerLevel !== null);
  const worst = ncs.reduce<ReceptorLevel | null>(
    (m, r) => (m === null || r.noncancerLevel! < m.noncancerLevel! ? r : m),
    null,
  );
  const noncancerLevel = worst === null ? null : worst.noncancerLevel;
  let level: number | null = null;
  let limiting: Endpoint | null = null;
  let limitingReceptor: string | null = null;
  if (cancerLevel !== null && (noncancerLevel === null || cancerLevel <= noncancerLevel)) {
    level = cancerLevel;
    limiting = 'cancer';
    limitingReceptor = additive
      ? recs.map((r) => r.label).join(' + ')
      : recs.find((r) => r.cancerLevel === cancerLevel)!.label;
  } else if (noncancerLevel !== null) {
    level = noncancerLevel;
    limiting = 'noncancer';
    limitingReceptor = worst!.label;
  }
  return {
    chemical,
    medium,
    level,
    limiting,
    cancerLevel,
    noncancerLevel,
    noncancerGroup: worst === null ? null : worst.noncancerGroup,
    limitingReceptor,
    byReceptor: recs,
  };
}

// ---------------------------------------------------------------- core

interface Core {
  receptors: readonly { label: string; pathways: readonly PathwayId[] }[];
  chemicals: readonly DirectChemical<{ csat?: number; iur?: number; rfc?: number }>[];
  coef: CoefFn;
  targets: RiskTargets | undefined;
  allocation: Allocation;
  additive: boolean;
  /** Per receptor, whether it is age-segmented (the additive option is refused for those). */
  segmented: readonly boolean[];
}

const MEDIA_ORDER: Medium[] = [
  'soil',
  'groundwater',
  'bathroomAir',
  'indoorAir',
  'outdoorAir',
  'surfaceWater',
];

function runCore(core: Core): DirectResult {
  const { receptors, chemicals, allocation } = core;
  checkReceptorCount(receptors.length, core.additive);
  if (core.additive) assertAdditiveAllowed(core.segmented);
  checkUniqueChemicals(
    'chemicals',
    chemicals.map((c) => c.id),
  );
  const withTargets = chemicals.filter((c) => c.concentrationTarget !== undefined);
  checkAllocationTargets(
    allocation,
    withTargets.map((c) => c.id),
  );
  const resolved = resolveRiskTargets(core.targets);
  const warnings: Warning[] = [...resolved.warnings];
  const { risk: tr, hq: thq } = resolved;

  const media = MEDIA_ORDER.filter((m) =>
    receptors.some((r) => r.pathways.some((p) => PATHWAYS[p].medium === m)),
  );
  if (withTargets.length > 0 && !media.includes('groundwater')) {
    throw new RangeError(
      'concentration targets apply to groundwater, but no groundwater pathway is on',
    );
  }

  const notComputable = new Set<string>();
  const results: DirectMediumResult[] = media.map((medium) => {
    // aggregated coefficients, [chemical][receptor]
    const aggs: Agg[][] = chemicals.map((_, ci) =>
      receptors.map((r, ri) =>
        aggregate(
          r.pathways
            .filter((p) => PATHWAYS[p].medium === medium)
            .map((pathway) => {
              const coef = core.coef(ri, ci, pathway);
              const key = `${r.label}|${chemicals[ci]!.id}|${pathway}`;
              if (!coef.computable && !notComputable.has(key)) {
                notComputable.add(key);
                warnings.push({
                  code: 'cleanup.pathway-not-computable',
                  message: `${r.label}: ${chemicals[ci]!.id} ${pathway} is not computable (missing ${coef.missing.join(', ')}) and contributes nothing`,
                });
              }
              return { pathway, coef };
            }),
        ),
      ),
    );
    const quantified = aggs.map((row) => row.some((a) => a.A > 0 || a.maxB > 0));
    chemicals.forEach((c, ci) => {
      if (!quantified[ci]) {
        warnings.push({
          code: 'cleanup.not-quantified',
          message: `${c.id}: no toxicity value for any linked ${medium} pathway; no risk-based level`,
        });
      }
    });

    let levels: DirectLevel[];
    let scale: number | null = null;
    let scaleLimiting: DirectMediumResult['scaleLimiting'] = null;

    if (allocation === 'cumulative') {
      const entered = chemicals.map((c, ci) => {
        const v = c.entered?.[medium];
        if (!quantified[ci]) return 0;
        if (v === undefined || !Number.isFinite(v) || v < 0) {
          throw new RangeError(
            `cumulative allocation needs an entered concentration for ${c.id} in ${medium}`,
          );
        }
        return v;
      });
      // a quantified chemical entered as zero has no ratio to scale: not quantified, never a level of zero
      const usable = chemicals.map((_, ci) => quantified[ci]! && entered[ci]! > 0);
      chemicals.forEach((c, ci) => {
        if (quantified[ci] && !usable[ci]) {
          warnings.push({
            code: 'cleanup.not-quantified',
            message: `${c.id}: entered concentration in ${medium} is zero; no cumulative level (it adds nothing to the totals)`,
          });
        }
      });
      if (!entered.some((v) => v > 0) && quantified.some(Boolean)) {
        throw new RangeError(
          `cumulative allocation needs a positive entered concentration in ${medium}`,
        );
      }
      // per receptor totals at the entered concentrations
      const perReceptor = receptors.map((r, ri) => {
        const risk = chemicals.reduce((s, _, ci) => s + aggs[ci]![ri]!.A * entered[ci]!, 0);
        const groups: Record<string, number> = {};
        chemicals.forEach((_, ci) => {
          for (const [g, v] of Object.entries(aggs[ci]![ri]!.B)) {
            groups[g] = (groups[g] ?? 0) + v * entered[ci]!;
          }
        });
        const hi = Math.max(0, ...Object.values(groups));
        const hiGroup = Object.entries(groups).find(([, v]) => v === hi)?.[0] ?? null;
        return { label: r.label, sc: div(tr, risk), snc: div(thq, hi), risk, hiGroup };
      });
      const totalRisk = perReceptor.reduce((s, p) => s + p.risk, 0);
      const sc = core.additive ? div(tr, totalRisk) : minOf(perReceptor.map((p) => p.sc));
      const sncWorst = perReceptor.reduce<(typeof perReceptor)[number] | null>(
        (m, p) => (p.snc !== null && (m === null || p.snc < m.snc!) ? p : m),
        null,
      );
      const snc = sncWorst === null ? null : sncWorst.snc;
      if (sc !== null && (snc === null || sc <= snc)) {
        scale = sc;
        scaleLimiting = 'cancer';
      } else if (snc !== null) {
        scale = snc;
        scaleLimiting = 'noncancer';
      }
      levels = chemicals.map((c, ci) => {
        const c0 = entered[ci]!;
        const scaled = (s: number | null): number | null => (s === null ? null : s * c0);
        const recs: ReceptorLevel[] = receptors.map((r, ri) => {
          const p = perReceptor[ri]!;
          const cancerLevel = scaled(p.sc);
          const noncancerLevel = scaled(p.snc);
          const useCancer = p.sc !== null && (p.snc === null || p.sc <= p.snc);
          return {
            label: r.label,
            level: useCancer ? cancerLevel : noncancerLevel,
            limiting: p.sc === null && p.snc === null ? null : useCancer ? 'cancer' : 'noncancer',
            cancerLevel,
            noncancerLevel,
            noncancerGroup: p.snc === null ? null : p.hiGroup,
            byPathway: [],
          };
        });
        const ok = usable[ci]!;
        return {
          chemical: c.id,
          medium,
          level: ok && scale !== null ? scale * c0 : null,
          limiting: ok && scale !== null ? scaleLimiting : null,
          cancerLevel: ok ? scaled(sc) : null,
          noncancerLevel: ok ? scaled(snc) : null,
          noncancerGroup: ok && sncWorst !== null ? sncWorst.hiGroup : null,
          limitingReceptor:
            ok && scale !== null
              ? scaleLimiting === 'noncancer'
                ? (sncWorst?.label ?? null)
                : core.additive
                  ? receptors.map((r) => r.label).join(' + ')
                  : (perReceptor.find((p) => p.sc === sc)?.label ?? null)
              : null,
          byReceptor: ok ? recs : [],
        };
      });
    } else {
      let trE = tr;
      let thqE = thq;
      if (allocation === 'equal') {
        const nC = aggs.filter((row) => row.some((a) => a.A > 0)).length;
        const nNc = aggs.filter((row) => row.some((a) => a.maxB > 0)).length;
        trE = nC > 0 ? tr / nC : tr;
        thqE = nNc > 0 ? thq / nNc : thq;
      }
      levels = chemicals.map((c, ci) => {
        const recs = receptors.map((r, ri) => receptorLevel(r.label, aggs[ci]![ri]!, trE, thqE));
        const lv = combine(c.id, medium, recs, aggs[ci]!, trE, core.additive);
        if (medium === 'groundwater' && c.concentrationTarget !== undefined) {
          const t = resolveConcentrationTarget(c.id, c.concentrationTarget, c.mcl);
          warnings.push(...t.warnings);
          if (t.value !== null) {
            return {
              ...lv,
              level: t.value,
              limiting: 'concentration' as const,
              limitingReceptor: null,
            };
          }
        }
        return lv;
      });
    }

    if (medium === 'groundwater') {
      const showerOn = receptors.some((r) => r.pathways.includes('showerInhalation'));
      chemicals.forEach((c, ci) => {
        const hasInhalation = c.chemical.iur !== undefined || c.chemical.rfc !== undefined;
        if (c.volatile === true && hasInhalation && !showerOn && levels[ci]!.level !== null) {
          warnings.push({
            code: 'cleanup.tapwater-inhalation-omitted',
            message: `${c.id}: the groundwater level omits the household-use inhalation term, so it can be higher than the RSL tap water level`,
          });
        }
      });
    }

    // checks against the chemical's own limits
    levels.forEach((lv, ci) => {
      const c = chemicals[ci]!;
      if (lv.level === null) return;
      if (medium === 'soil' && c.chemical.csat !== undefined && lv.level > c.chemical.csat) {
        warnings.push({
          code: 'cleanup.csat-exceeded',
          message: `${c.id}: the soil level exceeds the soil saturation concentration; free product may be present`,
        });
      }
      if (medium === 'groundwater' && c.solubility !== undefined && lv.level > c.solubility) {
        warnings.push({
          code: 'cleanup.above-solubility',
          message: `${c.id}: the groundwater level exceeds the solubility`,
        });
      }
    });

    return { medium, allocation, levels, scale, scaleLimiting };
  });

  if (allocation !== 'individual') {
    warnings.push({
      code: 'cleanup.hi-unsegregated',
      message: `${allocation} allocation sums or divides hazard quotients over all target organs (no organ segregation)`,
    });
  }
  return { media: results, warnings };
}

// ---------------------------------------------------------------- the two methods

function legacyCoef(input: DirectInput<LegacyReceptor, LegacyChemical>): CoefFn {
  return (ri, ci, pathway) => {
    const r = input.receptors[ri]!;
    const cell = legacyPathway(
      pathway,
      { cancer: 1, noncancer: 1 },
      r.receptor,
      input.chemicals[ci]!.chemical,
      { routeExtrapolation: r.routeExtrapolation === true },
    );
    return {
      computable: cell.computable,
      missing: cell.missing,
      a: cell.riskPerEpc,
      b: cell.hqPerEpc === null ? {} : { total: cell.hqPerEpc },
    };
  };
}

function modernCoef(input: DirectInput<ModernReceptor, ModernChemical>): CoefFn {
  return (ri, ci, pathway) => {
    const cell = modernPathway(
      pathway,
      input.receptors[ri]!.receptor,
      input.chemicals[ci]!.chemical,
      1,
    );
    return {
      computable: cell.computable,
      missing: cell.missing,
      a: cell.riskPerEpc,
      b: Object.fromEntries(cell.hqByGroup.map((g) => [g.group, g.hqPerEpc])),
    };
  };
}

/** Back-calculation with the RAGS Part A (1989) coefficients (`exposure.rags-a-1989`). */
export function backCalculateLegacy(
  input: DirectInput<LegacyReceptor, LegacyChemical>,
): DirectResult {
  return runCore({
    receptors: input.receptors,
    chemicals: input.chemicals,
    coef: legacyCoef(input),
    targets: input.targets,
    allocation: input.allocation ?? 'individual',
    additive: input.additive === true,
    segmented: input.receptors.map(() => false),
  });
}

/** Back-calculation with the RAGS Parts E and F (2014) coefficients (`exposure.rags-e-f-2014`). */
export function backCalculateModern(
  input: DirectInput<ModernReceptor, ModernChemical>,
): DirectResult {
  const result = runCore({
    receptors: input.receptors,
    chemicals: input.chemicals,
    coef: modernCoef(input),
    targets: input.targets,
    allocation: input.allocation ?? 'individual',
    additive: input.additive === true,
    segmented: input.receptors.map((r) => isAgeSegmented(r.receptor)),
  });
  // the RSL special cases warn here as on the risk screen, once per chemical, receptor and reason
  for (const r of input.receptors) {
    const seen = new Set<string>();
    for (const c of input.chemicals) {
      for (const pathway of r.pathways) {
        result.warnings.push(
          ...specialCaseWarnings(r.label, c.id, c.chemical, r.receptor, pathway, seen),
        );
      }
    }
  }
  return result;
}
