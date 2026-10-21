import { screensOf, siteOf, type Project, type Screens } from '../project';
import { feedsReadBy } from '../project/feedsRead';
import type { StaleFeedKey } from '../project/store';
import { siteSummary } from '../site/model';
import {
  dataEditionsFor,
  methodsRun,
  screenUsed,
  USED_SCREENS_ORDER,
  type ScreenKey,
  type FeedsLike,
} from './methodsRun';
import { buildMethodsStatement, type MethodsStatement } from './methodsStatement';
import * as cleanup from '../cleanup/project';
import * as household from '../household/project';
import * as plantsEco from '../plantsEco/project';
import * as risk from '../risk/project';
import * as saturated from '../saturated/project';
import * as surfaceWater from '../surfaceWater/project';
import * as transport from '../transport/project';
import * as uncertainty from '../uncertainty/project';
import * as vadose from '../vadose/project';
import * as vapor from '../vapor/project';

export { NON_AFFILIATION } from '../nonAffiliation';
import { NON_AFFILIATION } from '../nonAffiliation';

export const SCREEN_NAMES: Record<ScreenKey, string> = {
  transport: 'Groundwater transport',
  vadose: 'Vadose leaching',
  saturated: 'Saturated soil source',
  vapor: 'Vapor intrusion',
  surfaceWater: 'Surface water and sediment',
  risk: 'Exposure and risk',
  cleanup: 'Cleanup levels',
  household: 'Household water and soil air',
  plantsEco: 'Plants, ecology and TPH',
  uncertainty: 'Uncertainty analysis setup',
};

export interface InputRow {
  path: string;
  label: string;
  value: string;
}

const words = (segment: string): string =>
  segment.replace(/([a-z0-9])([A-Z])/g, (_m, a: string, b: string) => `${a} ${b.toLowerCase()}`);

function valueText(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v === '' ? '(blank)' : v;
  return String(v);
}

/** A form as a flat list of path, label and value rows; values stay as the user typed them. */
export function flattenInputs(form: unknown): InputRow[] {
  const rows: InputRow[] = [];
  const walk = (value: unknown, path: string, label: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`, `${label} ${i + 1}`));
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        walk(v, path === '' ? k : `${path}.${k}`, label === '' ? words(k) : `${label} ${words(k)}`);
      }
    } else {
      rows.push({ path, label, value: valueText(value) });
    }
  };
  walk(form, '', '');
  return rows;
}

const PROJECTORS: { [K in ScreenKey]: (s: Screens[K]) => unknown } = {
  transport: transport.toProject,
  vadose: vadose.toProject,
  saturated: saturated.toProject,
  vapor: vapor.toProject,
  surfaceWater: surfaceWater.toProject,
  risk: risk.toProject,
  cleanup: cleanup.toProject,
  household: household.toProject,
  plantsEco: plantsEco.toProject,
  uncertainty: uncertainty.toProject,
};

/** A screen's saved state wraps its fields in `form`; the report shows the field names alone. */
const dropFormPrefix = (r: InputRow): InputRow => ({
  ...r,
  path: r.path.replace(/^form\./, ''),
  label: r.label.replace(/^form /, ''),
});

export interface ReportSection {
  key: ScreenKey;
  name: string;
  inputs: InputRow[];
  methodIds: string[];
  /** The feeds from other screens this section's results are computed from (see `feedsReadBy`). */
  reads: StaleFeedKey[];
}

export interface Report {
  title: string;
  savedAt: string;
  createdWith: string;
  nonAffiliation: string;
  /** One line naming the advisory site model choices; null when they are the defaults. */
  site: string | null;
  sections: ReportSection[];
  /** Names of the screens left at their defaults, which the report does not cover. */
  unused: string[];
  statement: MethodsStatement;
}

/** The report model of a project: used screens with their inputs, then the generated methods statement. */
export function buildReport(project: Project): Report {
  const screens = screensOf(project);
  const feeds = project.feeds as FeedsLike | undefined;
  const run = methodsRun(screens, feeds);
  const reads = feedsReadBy(screens, project.feeds as Record<string, unknown> | undefined);
  const sections: ReportSection[] = [];
  const unused: string[] = [];
  for (const key of USED_SCREENS_ORDER) {
    if (!screenUsed(key, screens, feeds)) {
      unused.push(SCREEN_NAMES[key]);
      continue;
    }
    const project = PROJECTORS[key] as (s: Screens[ScreenKey]) => unknown;
    sections.push({
      key,
      name: SCREEN_NAMES[key],
      inputs: flattenInputs(project(screens[key])).map(dropFormPrefix),
      methodIds: run.byScreen[key] ?? [],
      reads: reads[key] ?? [],
    });
  }
  const statement = buildMethodsStatement({
    methodIds: run.ids,
    dataEditions: dataEditionsFor(run.byScreen, project.data),
  });
  return {
    title: project.title ?? '',
    savedAt: project.savedAt,
    createdWith: project.createdWith,
    nonAffiliation: NON_AFFILIATION,
    site: project.site === undefined ? null : siteSummary(siteOf(project)),
    sections,
    unused,
    statement,
  };
}
