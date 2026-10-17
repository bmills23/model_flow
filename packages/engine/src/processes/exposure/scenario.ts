import type { Warning } from '../../registry/index.js';
import { assertAdditiveAllowed } from '../risk/additivity.js';
import {
  summarizeLegacyReceptor,
  summarizeModernReceptor,
  summarizeRun,
  type RunRiskSummary,
} from '../risk/summary.js';
import { maximizeWindows, windowAverage, type WindowTerm } from './averaging.js';
import {
  checkEpcSpec,
  checkReceptorCount,
  checkStartOption,
  checkUniqueChemicals,
  type StartOption,
} from './checks.js';
import type { EpcSpec } from './epc.js';
import type { LegacyChemical, LegacyReceptor } from './legacy.js';
import { isAgeSegmented } from './lifeStages.js';
import {
  modernPathway,
  noncancerGroups,
  type ModernChemical,
  type ModernEpcInput,
} from './modern.js';
import { evaluateLegacyRun, type LegacyEpcInput, type LegacyRunResult } from './receptorsLegacy.js';
import {
  evaluateModernRun,
  type ModernReceptorRun,
  type ModernRunResult,
} from './receptorsModern.js';
import { YEAR_S, type PathwayId } from './units.js';

/**
 * The scenario runner: user-entered media and transport series (M1, through `groundwaterBreakthrough`)
 * reduced to the exposure point concentrations each method needs, then evaluated by the kernels and
 * summarized. One or two receptors run side by side.
 *
 * Legacy windows (RISC5 choice): the noncancer dose uses the largest average over any window of 7 years
 * (the exposure duration when shorter), the cancer dose the largest average over any window of the
 * exposure duration. Modern (default ruling 4): the receptor's exposure starts at the time that
 * maximizes the cancer risk, life stages follow in sequence, and each noncancer group uses the largest
 * average over a window of its own duration. A series that ends before a window does is averaged over
 * the span it covers (nothing at all for a stage it does not reach) and warned.
 */

export interface ScenarioChemical<C> {
  id: string;
  chemical: C;
  /** EPC per pathway; a pathway absent here skips this chemical for that pathway. */
  epcs: Partial<Record<PathwayId, EpcSpec>>;
}

/** How an EPC was reduced for one chemical and pathway of a receptor. */
export interface EpcRecord {
  chemical: string;
  pathway: PathwayId;
  origin: string;
  kind: 'constant' | 'series';
  /** Legacy: the cancer window average. Modern: the average of each cancer life stage. */
  cancer: number | number[];
  /** Legacy: the noncancer window average. Modern: the average of each noncancer group. */
  noncancer: number | Record<string, number>;
  /** True when a series did not cover a window and a span was averaged instead. */
  shorter: boolean;
}

const SEVEN_YEARS = 7 * YEAR_S;

// ---------------------------------------------------------------- legacy

export interface LegacyScenarioReceptor {
  label: string;
  receptor: LegacyReceptor;
  pathways: readonly PathwayId[];
  chemicals: readonly ScenarioChemical<LegacyChemical>[];
  routeExtrapolation?: boolean;
}

export interface LegacyScenarioInput {
  receptors: readonly LegacyScenarioReceptor[];
  /** Also sum the two receptors' cancer risks (never their hazard indices). */
  additive?: boolean;
}

export interface LegacyScenarioResult extends LegacyRunResult {
  /** EPC records per receptor, in input order. */
  epcs: EpcRecord[][];
  summary: RunRiskSummary;
}

function shorterWarning(label: string, chemical: string, pathway: PathwayId): Warning {
  return {
    code: 'exposure.series-shorter-than-window',
    message: `${label}: the ${pathway} series for ${chemical} ends before the averaging window does; the span it covers is averaged`,
  };
}

function checkSpecs(
  label: string,
  pathways: readonly PathwayId[],
  chemicals: readonly ScenarioChemical<unknown>[],
): void {
  checkUniqueChemicals(
    label,
    chemicals.map((c) => c.id),
  );
  for (const pathway of pathways) {
    for (const c of chemicals) {
      const spec = c.epcs[pathway];
      if (spec !== undefined) checkEpcSpec(`${label}: ${c.id} ${pathway}`, pathway, spec);
    }
  }
}

export function runLegacyScenario(input: LegacyScenarioInput): LegacyScenarioResult {
  checkReceptorCount(input.receptors.length, input.additive);
  for (const r of input.receptors) checkSpecs(r.label, r.pathways, r.chemicals);

  const epcs: EpcRecord[][] = [];
  const seriesWarnings: Warning[][] = [];
  const runs = input.receptors.map((r) => {
    const records: EpcRecord[] = [];
    const warnings: Warning[] = [];
    const chemicals = r.chemicals.map((c) => {
      const reduced: Partial<Record<PathwayId, LegacyEpcInput>> = {};
      for (const pathway of r.pathways) {
        const spec = c.epcs[pathway];
        if (spec === undefined) continue;
        if (spec.kind === 'constant') {
          reduced[pathway] = spec.value;
          records.push({
            chemical: c.id,
            pathway,
            origin: spec.origin,
            kind: 'constant',
            cancer: spec.value,
            noncancer: spec.value,
            shorter: false,
          });
          continue;
        }
        const window = (length: number) =>
          maximizeWindows([{ series: spec.series, windows: [{ offset: 0, length, weight: 1 }] }]);
        const cancer = window(r.receptor.ed);
        const noncancer = window(Math.min(SEVEN_YEARS, r.receptor.ed));
        reduced[pathway] = { cancer: cancer.value, noncancer: noncancer.value };
        const shorter = cancer.shorter || noncancer.shorter;
        if (shorter) warnings.push(shorterWarning(r.label, c.id, pathway));
        records.push({
          chemical: c.id,
          pathway,
          origin: spec.origin,
          kind: 'series',
          cancer: cancer.value,
          noncancer: noncancer.value,
          shorter,
        });
      }
      return { id: c.id, chemical: c.chemical, epcs: reduced };
    });
    epcs.push(records);
    seriesWarnings.push(warnings);
    return {
      label: r.label,
      receptor: r.receptor,
      pathways: r.pathways,
      chemicals,
      routeExtrapolation: r.routeExtrapolation === true,
    };
  });

  const result = evaluateLegacyRun(runs, { additive: input.additive === true });
  result.receptors.forEach((r, i) => r.warnings.push(...seriesWarnings[i]!));
  const warnings = [...seriesWarnings.flat(), ...result.warnings];
  const summary = summarizeRun(
    result.receptors.map(summarizeLegacyReceptor),
    input.additive === true,
  );
  return { ...result, warnings, epcs, summary };
}

// ---------------------------------------------------------------- modern

export interface ModernScenarioReceptor {
  label: string;
  receptor: ModernReceptorRun['receptor'];
  pathways: readonly PathwayId[];
  chemicals: readonly ScenarioChemical<ModernChemical>[];
}

export interface ModernScenarioInput extends StartOption {
  receptors: readonly ModernScenarioReceptor[];
  /** Also sum the two receptors' cancer risks; refused with an age-segmented receptor. */
  additive?: boolean;
}

export interface ModernScenarioResult extends ModernRunResult {
  epcs: EpcRecord[][];
  /** The exposure start time of each receptor, s; null when every EPC is a constant. */
  startTimes: (number | null)[];
  summary: RunRiskSummary;
}

function cancerStagesOf(
  receptor: ModernScenarioReceptor['receptor'],
  chem: ModernChemical,
): ModernScenarioReceptor['receptor']['stages'] {
  return chem.mutagen && receptor.mutagenStages !== undefined
    ? receptor.mutagenStages
    : receptor.stages;
}

function stageWindows(
  stages: ModernScenarioReceptor['receptor']['stages'],
  weights: readonly number[],
): { offset: number; length: number; weight: number }[] {
  let offset = 0;
  return stages.map((s, k) => {
    const w = { offset, length: s.ed, weight: weights[k] ?? 0 };
    offset += s.ed;
    return w;
  });
}

export function runModernScenario(input: ModernScenarioInput): ModernScenarioResult {
  checkReceptorCount(input.receptors.length, input.additive);
  checkStartOption(input.exposureStart);
  if (input.additive === true) {
    assertAdditiveAllowed(input.receptors.map((r) => isAgeSegmented(r.receptor)));
  }
  for (const r of input.receptors) checkSpecs(r.label, r.pathways, r.chemicals);

  const epcs: EpcRecord[][] = [];
  const startTimes: (number | null)[] = [];
  const seriesWarnings: Warning[][] = [];
  const runs: ModernReceptorRun[] = input.receptors.map((r) => {
    const groups = noncancerGroups(r.receptor);
    const cells = r.pathways.flatMap((pathway) =>
      r.chemicals.flatMap((c) => {
        const spec = c.epcs[pathway];
        return spec === undefined ? [] : [{ c, pathway, spec }];
      }),
    );

    // the one exposure start time of the receptor: maximizes the cancer risk over every series
    const terms: WindowTerm[] = [];
    for (const { c, pathway, spec } of cells) {
      if (spec.kind !== 'series') continue;
      const unit = modernPathway(pathway, r.receptor, c.chemical, 1);
      const stages = cancerStagesOf(r.receptor, c.chemical);
      terms.push({
        series: spec.series,
        windows: stageWindows(
          stages,
          stages.map((_, k) => unit.riskByStage[k]?.riskPerEpc ?? 0),
        ),
      });
    }
    const option = input.exposureStart;
    const scan =
      terms.length === 0
        ? null
        : maximizeWindows(terms, typeof option === 'number' ? { start: option } : {});
    startTimes.push(scan === null ? null : scan.start);

    const records: EpcRecord[] = [];
    const warnings: Warning[] = [];
    const chemicals = r.chemicals.map((c) => {
      const reduced: Partial<Record<PathwayId, ModernEpcInput>> = {};
      for (const pathway of r.pathways) {
        const spec = c.epcs[pathway];
        if (spec === undefined) continue;
        if (spec.kind === 'constant') {
          reduced[pathway] = spec.value;
          records.push({
            chemical: c.id,
            pathway,
            origin: spec.origin,
            kind: 'constant',
            cancer: spec.value,
            noncancer: spec.value,
            shorter: false,
          });
          continue;
        }
        let shorter = false;
        const windows = stageWindows(cancerStagesOf(r.receptor, c.chemical), []);
        const cancerByStage = windows.map((w) => {
          const a = windowAverage(
            spec.series,
            scan!.start + w.offset,
            scan!.start + w.offset + w.length,
          );
          if (!a.complete) shorter = true;
          return a.average;
        });
        const noncancerByGroup: Record<string, number> = {};
        for (const g of groups) {
          const m = maximizeWindows([
            { series: spec.series, windows: [{ offset: 0, length: g.stage.ed, weight: 1 }] },
          ]);
          if (m.shorter) shorter = true;
          noncancerByGroup[g.group] = m.value;
        }
        reduced[pathway] = { cancerByStage, noncancerByGroup };
        if (shorter) warnings.push(shorterWarning(r.label, c.id, pathway));
        records.push({
          chemical: c.id,
          pathway,
          origin: spec.origin,
          kind: 'series',
          cancer: cancerByStage,
          noncancer: noncancerByGroup,
          shorter,
        });
      }
      return { id: c.id, chemical: c.chemical, epcs: reduced };
    });
    epcs.push(records);
    seriesWarnings.push(warnings);
    return { label: r.label, receptor: r.receptor, pathways: r.pathways, chemicals };
  });

  const result = evaluateModernRun(runs, { additive: input.additive === true });
  result.receptors.forEach((r, i) => r.warnings.push(...seriesWarnings[i]!));
  const warnings = [...seriesWarnings.flat(), ...result.warnings];
  const summary = summarizeRun(
    result.receptors.map(summarizeModernReceptor),
    input.additive === true,
  );
  return { ...result, warnings, epcs, startTimes, summary };
}
