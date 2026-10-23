import {
  at123dBankPlane,
  at123dConcentration,
  bankScreenAverage,
  domenicoReachLength,
  runLegacySurfaceWater,
  runModernSurfaceWater,
  type LegacySurfaceWaterInput,
  type ModernSurfaceWaterInput,
  type SurfaceWaterWarning,
} from '@model-flow/engine';
import { at123dInput, withFedSteps } from '../transport/compute';
import { makeZOf, type Scenario } from '../transport/form';
import type { SwRequest } from './inputs';

/** Sample times of a run (the curves have this many points after t = 0). */
export const N_TIMES = 24;
/**
 * Tolerance of the bank plane quadrature. The engine default (1e-9, eight panels per axis) is many times
 * dearer for a 24 point curve; this setting holds the plane integral within 1 percent of the tight one
 * (the test in compute.test.ts).
 */
export const BANK_QUADRATURE = { relTol: 1e-3, panels: 1 } as const;
/**
 * Absolute tolerance of each bank plane point, as a share of the centreline surface concentration at the
 * same time. The plane spans the whole reach, which can be far wider than the plume, and without it the
 * points in the far tail (many orders of magnitude below the peak) each ran the time integral to its
 * deepest refinement: about 90 percent of the cost of a 2000 m reach. At 1e-9 of the peak the plane
 * discharge moves by well under 1e-6 relative (compute.test.ts holds it).
 */
export const BANK_TAIL_TOLERANCE = 1e-9;
/** Points of the trapezoid over the discharge thickness for the bank screen average. */
const SCREEN_POINTS = 5;

export interface SedimentOut {
  quantified: boolean;
  /** kg/kg dry weight; absent when not quantified. */
  concentrations?: number[];
  /** kg/kg organic carbon, when Kd came from a Koc. */
  organicCarbonNormalized?: number[];
  poreWater: string;
}

export interface SwResult {
  /** s, strictly increasing. */
  times: number[];
  linked: boolean;
  linkLabel?: string;
  /** Reach length used, m. */
  reachLength: number;
  legacy: {
    /** kg/m^3 */
    groundwaterConcentrations: number[];
    surfaceWater: number[];
    /** m^3/s */
    groundwaterFlow: number;
    sediment: SedimentOut;
    warnings: SurfaceWaterWarning[];
  };
  modern: {
    surfaceWater: number[];
    /** W / Q_gw, kg/m^3 */
    fluxAveraged: number[];
    /** m^3/s */
    groundwaterFlow: number;
    /** s */
    residenceTime: number;
    downstream?: number[];
    sediment: SedimentOut;
    warnings: SurfaceWaterWarning[];
  };
}

export type SwOutcome = { ok: true; result: SwResult } | { ok: false; error: string };

const grid = (end: number): number[] =>
  Array.from({ length: N_TIMES }, (_, k) => (end * (k + 1)) / N_TIMES);

function sedimentOut(s: {
  quantified: boolean;
  concentrations?: number[] | undefined;
  organicCarbonNormalized?: number[] | undefined;
  poreWater: string;
}): SedimentOut {
  return {
    quantified: s.quantified,
    poreWater: s.poreWater,
    ...(s.concentrations ? { concentrations: [...s.concentrations] } : {}),
    ...(s.organicCarbonNormalized
      ? { organicCarbonNormalized: [...s.organicCarbonNormalized] }
      : {}),
  };
}

/** The M1 source release rate at time t, kg/s, for a typed (not vadose or saturated fed) source. */
function releaseRate(s: Omit<Scenario, 'zOf'>, t: number): number {
  return s.terms.reduce(
    (a, term) => (t >= term.start && t < term.end ? a + s.massRate * term.factor : a),
    0,
  );
}

/**
 * Half width and depth of the "full" plane for the reach and underflow checks: generous (eight standard
 * deviations of the spreading) so that the share inside the reach and above the thickness is measured
 * against essentially the whole plume. The plane quadrature narrows to the plume, so the size is cheap.
 */
function fullExtent(
  s: Omit<Scenario, 'zOf'>,
  reachLength: number,
  thickness: number,
): { fullHalfWidth: number; fullDepth: number } {
  const spread = (d: number): number => 8 * Math.sqrt(2 * Math.max(d, 0) * Math.max(s.time, 0));
  return {
    fullHalfWidth: Math.max(reachLength / 2, s.srcWidth / 2 + spread(s.dy)),
    fullDepth: Math.max(thickness, s.thickness ?? 0, s.srcDepth + spread(s.dz)),
  };
}

/**
 * What a linked run holds that is exactly proportional to the groundwater loading: the screen-averaged
 * groundwater concentration at the bank (legacy), and the mass discharge across the bank plane with the
 * flow through it and the depth share (modern). A run whose loading is the base loading times k has these
 * times k, so `computeScaled` evaluates it without repeating the transport integrals (the dear part of a
 * linked run). The upstream background is not part of it: it stays as entered.
 */
export interface SwBase {
  /** kg/m^3 */
  gw: number[];
  /** Mass discharge W(t) across the bank plane, kg/s. */
  discharge: number[];
  /** m^3/s */
  groundwaterFlow: number;
  depthFraction?: number;
}

export function compute(req: SwRequest): SwOutcome {
  return evaluate(req).outcome;
}

/** A full run of a linked request, with the proportional part kept for `computeScaled`. */
export function computeBase(req: SwRequest): { outcome: SwOutcome; base: SwBase | null } {
  return evaluate(req);
}

/**
 * The run of `req` with its groundwater loading multiplied by `k`, from the base of the unscaled run of
 * `req` itself. The surface water, sediment and flow series equal the full run's to rounding (the bank
 * plane quadrature decides its refinement on relative tolerances, so it is scale free); the warnings of
 * the bank plane (reach and depth shares) are not repeated. Meant for the level search, which reads the
 * peak.
 */
export function computeScaled(req: SwRequest, base: SwBase, k: number): SwOutcome {
  return evaluate(req, { base, k }).outcome;
}

function evaluate(
  req: SwRequest,
  scaled?: { base: SwBase; k: number },
): { outcome: SwOutcome; base: SwBase | null } {
  let base: SwBase | null = null;
  try {
    const link = req.link;
    const scenario: Scenario | null = link
      ? withFedSteps({ ...link.scenario, zOf: makeZOf(link.scenario.thickness) })
      : null;
    const times = grid(scenario ? scenario.time : req.duration);

    // reach length: entered, or the 5 percent Domenico width at the bank distance
    let legacyReach: LegacySurfaceWaterInput['reach'];
    let reachLength: number;
    if (req.reach.kind === 'entered') {
      legacyReach = { kind: 'entered', length: req.reach.length };
      reachLength = req.reach.length;
    } else {
      if (req.bankX === undefined) throw new RangeError('the distance to the bank is needed');
      const spec = { sourceWidth: req.reach.sourceWidth, distance: req.bankX };
      legacyReach = { kind: 'domenico', ...spec };
      reachLength = domenicoReachLength(spec);
    }

    // groundwater at the bank for the legacy method: the screen-averaged centreline concentration
    let gw: number[];
    let source: { bankX: number; darcyFlux: number; thickness: number } | null = null;
    if (scenario) {
      if (req.bankX === undefined || req.thickness === undefined) {
        throw new RangeError('the bank distance and the discharge thickness are needed');
      }
      source = {
        bankX: req.bankX,
        darcyFlux: scenario.velocity * scenario.porosity,
        thickness: req.thickness,
      };
      if (scaled) {
        gw = scaled.base.gw.map((v) => v * scaled.k);
      } else {
        const input = at123dInput(scenario, 0);
        const { time: _t, ...fixed } = input;
        void _t;
        const depths = Array.from(
          { length: SCREEN_POINTS },
          (_, k) => (source!.thickness * k) / (SCREEN_POINTS - 1),
        );
        gw = [
          ...bankScreenAverage(
            (t) => ({
              concentrations: depths.map((d) =>
                at123dConcentration(
                  { ...fixed, time: t },
                  { x: source!.bankX, y: 0, z: scenario.zOf(d) },
                ),
              ),
            }),
            times,
          ).values,
        ];
      }
    } else {
      gw = times.map(() => req.groundwaterConcentration);
    }

    const body = req.body;
    const legacyIn: LegacySurfaceWaterInput = {
      body,
      upstreamFlow: req.upstreamFlow,
      background: req.background,
      mixingFraction: req.mixingFraction,
      decay: req.decay,
      reach: legacyReach,
      discharge: req.discharge,
      times,
      groundwaterConcentrations: gw,
      ...(req.sediment
        ? {
            sediment: {
              fractionOrganicCarbon: req.sediment.fractionOrganicCarbon,
              ...(req.sediment.koc !== undefined ? { koc: req.sediment.koc } : {}),
              ...(req.sediment.kd !== undefined ? { kd: req.sediment.kd } : {}),
            },
          }
        : {}),
      ...(req.solubility !== undefined ? { solubility: req.solubility } : {}),
      ...(scenario && source
        ? {
            link: {
              darcyFlux: source.darcyFlux,
              ...(scenario.fed
                ? {}
                : { sourceReleaseRates: times.map((t) => releaseRate(scenario, t)) }),
            },
          }
        : {}),
    };
    const runLegacy = (plumeDepthFraction?: number) =>
      runLegacySurfaceWater(
        plumeDepthFraction !== undefined && legacyIn.link
          ? { ...legacyIn, link: { ...legacyIn.link, plumeDepthFraction } }
          : legacyIn,
      );
    // unlinked: the legacy run fixes the groundwater flow that the typed discharge series needs
    const legacyFirst = scenario && source ? null : runLegacy();

    // modern: mass discharge across the bank plane (linked) or the typed concentration times the flow
    const sedimentIn = req.sediment
      ? {
          fractionOrganicCarbon: req.sediment.fractionOrganicCarbon,
          ...(req.sediment.koc !== undefined ? { koc: req.sediment.koc } : {}),
          ...(req.sediment.kd !== undefined ? { kd: req.sediment.kd } : {}),
          poreWater: req.sediment.poreWater,
        }
      : undefined;
    let bank: ModernSurfaceWaterInput['bank'];
    if (scenario && source && scaled) {
      bank = {
        kind: 'discharge',
        times,
        discharge: scaled.base.discharge.map((w) => w * scaled.k),
        groundwaterFlow: scaled.base.groundwaterFlow,
      };
    } else if (scenario && source) {
      const { time: _t, ...fixed } = at123dInput(scenario, 0);
      void _t;
      bank = {
        kind: 'plane',
        concentration: at123dBankPlane(fixed, source.bankX, scenario.zOf(0), {
          tailTolerance: BANK_TAIL_TOLERANCE,
        }),
        plane: {
          reachLength,
          thickness: source.thickness,
          darcyFlux: source.darcyFlux,
          ...fullExtent(scenario, reachLength, source.thickness),
        },
        times,
        quadrature: BANK_QUADRATURE,
      };
    } else {
      bank = {
        kind: 'discharge',
        times,
        discharge: gw.map((c) => c * legacyFirst!.groundwaterFlow),
        groundwaterFlow: legacyFirst!.groundwaterFlow,
      };
    }
    const modernIn: ModernSurfaceWaterInput = {
      body: body.type === 'river' ? { ...body, reachLength } : body,
      upstreamFlow: req.upstreamFlow,
      background: req.background,
      mixingFraction: req.mixingFraction,
      decay: req.decay,
      bank,
      centrelineConcentrations: gw,
      ...(req.downstream !== undefined && body.type === 'river'
        ? { downstream: { distance: req.downstream } }
        : {}),
      ...(sedimentIn ? { sediment: sedimentIn } : {}),
      ...(req.solubility !== undefined ? { solubility: req.solubility } : {}),
    };
    const modern = runModernSurfaceWater(modernIn);
    // linked: the legacy underflow check takes the depth share measured on the modern bank plane
    const legacy =
      legacyFirst ?? runLegacy(scaled ? scaled.base.depthFraction : modern.depthFraction);
    if (scenario && source && !scaled) {
      base = {
        gw: [...gw],
        discharge: [...modern.discharge],
        groundwaterFlow: modern.groundwaterFlow,
        ...(modern.depthFraction !== undefined ? { depthFraction: modern.depthFraction } : {}),
      };
    }

    const outcome: SwOutcome = {
      ok: true,
      result: {
        times,
        linked: scenario !== null,
        ...(link ? { linkLabel: link.label } : {}),
        reachLength,
        legacy: {
          groundwaterConcentrations: legacy.groundwaterConcentrations,
          surfaceWater: legacy.surfaceWater,
          groundwaterFlow: legacy.groundwaterFlow,
          sediment: sedimentOut(legacy.sediment),
          warnings: legacy.warnings,
        },
        modern: {
          surfaceWater: modern.surfaceWater,
          fluxAveraged: modern.fluxAveragedConcentration,
          groundwaterFlow: modern.groundwaterFlow,
          residenceTime: modern.residenceTime,
          ...(modern.downstream ? { downstream: modern.downstream } : {}),
          sediment: sedimentOut(modern.sediment),
          warnings: modern.warnings,
        },
      },
    };
    return { outcome, base };
  } catch (e) {
    return {
      outcome: { ok: false, error: e instanceof Error ? e.message : String(e) },
      base: null,
    };
  }
}
