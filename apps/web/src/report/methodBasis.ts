import type { CsvRow } from '../export/csv';
import type { Screens } from '../project';
import { fmtHi, fmtRisk } from '../risk/chartData';
import { RISK_METHOD_IDS } from '../risk/csv';
import { LEGACY_ID, MODERN_ID } from '../surfaceWater/csv';
import type { ScreenKey } from './methodsRun';

/**
 * Which method a report section's conclusions rest on. Where a section shows legacy and modern results
 * side by side, the report must say which one it stands on (the screen's own choice of method shown),
 * print the other as a sensitivity, and say so where the two disagree on whether a criterion or target
 * is exceeded. Pure: the saved screens in, words out.
 */

export type Basis = 'legacy' | 'modern' | 'oxygen-limited';

/** Where the basis came from: the screen's own choice, the result sent on, or a default for a screen with no choice. */
export type BasisFrom = 'screen' | 'sent' | 'default';

export interface BasisChoice {
  basis: Basis;
  from: BasisFrom;
}

export interface MethodBasis {
  /** The method the conclusions rest on, as a phrase ("modern method"). */
  basis: string;
  /** What the section's conclusions rest on and how the other method is read. */
  statement: string;
  /** Exceedances the two methods disagree on, one sentence each. */
  disagreements: string[];
}

/**
 * The method a screen's section rests on, or null for a screen that does not show legacy against modern
 * (household, plants and ecology, uncertainty setup). `sentSurfaceWater` is the method of the surface
 * water result sent to the exposure and risk screen for the run's chemical, when one was sent.
 */
export function basisChoice(
  key: ScreenKey,
  screens: Screens,
  sentSurfaceWater: 'well-mixed' | 'mass-discharge' | null,
): BasisChoice | null {
  const shown = (m: string): BasisChoice =>
    m === 'legacy' || m === 'modern'
      ? { basis: m, from: 'screen' }
      : { basis: 'modern', from: 'default' };
  switch (key) {
    case 'transport':
      return shown(screens.transport.form.mapMethod);
    case 'vadose':
      return shown(screens.vadose.form.method);
    case 'saturated':
      return shown(screens.saturated.form.method);
    case 'vapor':
      return screens.vapor.form.method === 'devaull'
        ? { basis: 'oxygen-limited', from: 'screen' }
        : shown(screens.vapor.form.method);
    case 'surfaceWater':
      return sentSurfaceWater === null
        ? { basis: 'modern', from: 'default' }
        : { basis: sentSurfaceWater === 'well-mixed' ? 'legacy' : 'modern', from: 'sent' };
    case 'risk':
    case 'cleanup':
      return { basis: 'modern', from: 'default' };
    default:
      return null;
  }
}

const BASIS_NAME: Record<Basis, string> = {
  legacy: 'legacy method',
  modern: 'modern method',
  'oxygen-limited': 'oxygen-limited method',
};

const OTHERS: Record<Basis, string> = {
  legacy: 'The modern method',
  modern: 'The legacy method',
  'oxygen-limited': 'The legacy and modern methods',
};

/** The sentences a section prints about its basis, with the disagreements found in its tables. */
export function methodBasisOf(choice: BasisChoice, disagreements: readonly string[]): MethodBasis {
  const name = BASIS_NAME[choice.basis];
  const lead =
    choice.from === 'screen'
      ? `The conclusions in this section rest on the ${name}, the method shown on the screen.`
      : choice.from === 'sent'
        ? `The conclusions in this section rest on the ${name}, the one sent to the exposure and risk screen.`
        : `This screen does not offer a choice of method, so the conclusions in this section rest on the ${name}.`;
  const others = OTHERS[choice.basis];
  const sensitivity = `${others === 'The legacy and modern methods' ? 'The legacy and modern methods are' : `${others} is`} printed as a sensitivity check and is not the basis of any conclusion here.`;
  return { basis: name, statement: `${lead} ${sensitivity}`, disagreements: [...disagreements] };
}

const sig3 = (x: number): string => String(Number(x.toPrecision(3)));
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The surface water criteria the two methods disagree on: the same chemical, medium, criterion and water
 * type, compared for both, one exceeded and one not. A criterion not compared (site specific, element
 * basis, covered by a group) has no exceedance and is never flagged.
 */
export function criteriaDisagreements(rows: readonly CsvRow[]): string[] {
  const groups = new Map<string, { legacy?: CsvRow; modern?: CsvRow }>();
  for (const r of rows) {
    if (r['status'] !== 'compared' || typeof r['exceeds'] !== 'boolean') continue;
    const method =
      r['method'] === LEGACY_ID ? 'legacy' : r['method'] === MODERN_ID ? 'modern' : null;
    if (method === null) continue;
    const key = ['chemical', 'medium', 'set', 'basis', 'waterType', 'criterion', 'source']
      .map((k) => text(r[k]))
      .join('|');
    const g = groups.get(key) ?? {};
    g[method] = r;
    groups.set(key, g);
  }
  const out: string[] = [];
  for (const { legacy, modern } of groups.values()) {
    if (legacy === undefined || modern === undefined) continue;
    if (legacy['exceeds'] === modern['exceeds']) continue;
    const water = text(legacy['waterType']);
    const what = [
      text(legacy['chemical']),
      text(legacy['medium']),
      text(legacy['basis']) || text(legacy['criterion']),
    ]
      .filter((t) => t !== '')
      .join(', ');
    const side = (r: CsvRow): string =>
      `ratio ${typeof r['ratio'] === 'number' ? sig3(r['ratio']) : 'not given'} (${r['exceeds'] === true ? 'exceeds' : 'does not exceed'})`;
    out.push(
      `${what}${water === '' ? '' : ` (${water})`}: legacy ${side(legacy)}, modern ${side(modern)}.`,
    );
  }
  return out;
}

/** The benchmarks the exposure and risk results are read against when the two methods are compared. */
const RISK_BENCHMARK = 1e-6;
const HI_BENCHMARK = 1;

/**
 * The exposure and risk results on opposite sides of the usual benchmarks (a cancer risk of 1e-6, a
 * hazard index of 1) for the two methods. A value that was not quantified is skipped.
 */
export function riskDisagreements(rows: readonly CsvRow[]): string[] {
  const out: string[] = [];
  const by = new Map<string, { legacy?: CsvRow; modern?: CsvRow }>();
  for (const r of rows) {
    const method =
      r['method'] === RISK_METHOD_IDS.legacy
        ? 'legacy'
        : r['method'] === RISK_METHOD_IDS.modern
          ? 'modern'
          : null;
    if (method === null) continue;
    const g = by.get(text(r['receptor'])) ?? {};
    g[method] = r;
    by.set(text(r['receptor']), g);
  }
  const side = (v: number, bench: number): string => (v > bench ? 'above' : 'below');
  for (const [receptor, { legacy, modern }] of by) {
    if (legacy === undefined || modern === undefined) continue;
    const pairs = [
      ['cancer risk', 'cancerRisk', RISK_BENCHMARK, fmtRisk, '1e-6'],
      ['hazard index', 'hazardIndex', HI_BENCHMARK, fmtHi, '1'],
    ] as const;
    for (const [label, key, bench, fmt, benchText] of pairs) {
      const l = legacy[key];
      const m = modern[key];
      if (typeof l !== 'number' || typeof m !== 'number') continue;
      if (side(l, bench) === side(m, bench)) continue;
      out.push(
        `${receptor}, ${label} against ${benchText}: legacy ${fmt(l)} (${side(l, bench)}), modern ${fmt(m)} (${side(m, bench)}).`,
      );
    }
  }
  return out;
}
