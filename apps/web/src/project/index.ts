import type { z } from 'zod';
import * as overrides from '../overrides/project';
import type { OverridesState } from '../overrides/model';
import * as site from '../site/project';
import type { SiteState } from '../site/model';
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
import { fingerprintForm, hashInputs } from './hash';
import { unknownKeyPaths } from './merge';
import { CURRENT_VERSION, migrate } from './migrate';
import { PROJECT_FORMAT, feedShapes, projectV1Schema, type Feeds, type Project } from './schema';

export { CURRENT_VERSION } from './migrate';
export { PROJECT_FORMAT, type Feeds, type Project } from './schema';
export { hashInputs } from './hash';

/** The live state of the screens (and the two uncertainty panels), in the form each screen's `fromProject` hands back. */
export interface Screens {
  transport: transport.TransportState;
  vadose: vadose.VadoseState;
  saturated: saturated.SaturatedState;
  vapor: vapor.VaporState;
  surfaceWater: surfaceWater.SurfaceWaterState;
  risk: risk.RiskState;
  cleanup: cleanup.CleanupState;
  household: household.HouseholdState;
  plantsEco: plantsEco.PlantsEcoState;
  uncertainty: uncertainty.UncertaintyState;
}

/** Every screen at its defaults (a new project). */
export function defaultScreens(): Screens {
  return {
    transport: transport.fromProject(undefined),
    vadose: vadose.fromProject(undefined),
    saturated: saturated.fromProject(undefined),
    vapor: vapor.fromProject(undefined),
    surfaceWater: surfaceWater.fromProject(undefined),
    risk: risk.fromProject(undefined),
    cleanup: cleanup.fromProject(undefined),
    household: household.fromProject(undefined),
    plantsEco: plantsEco.fromProject(undefined),
    uncertainty: uncertainty.fromProject(undefined),
  };
}

/** The live screens of a loaded project; an absent screen key gives that screen's defaults. */
export function screensOf(project: Project): Screens {
  const s = project.screens;
  return {
    transport: transport.fromProject(s.transport),
    vadose: vadose.fromProject(s.vadose),
    saturated: saturated.fromProject(s.saturated),
    vapor: vapor.fromProject(s.vapor),
    surfaceWater: surfaceWater.fromProject(s.surfaceWater),
    risk: risk.fromProject(s.risk),
    cleanup: cleanup.fromProject(s.cleanup),
    household: household.fromProject(s.household),
    plantsEco: plantsEco.fromProject(s.plantsEco),
    uncertainty: uncertainty.fromProject(s.uncertainty),
  };
}

export interface BuildOptions {
  screens: Screens;
  feeds?: Feeds;
  overrides?: OverridesState;
  site?: SiteState;
  data?: NonNullable<Project['data']>;
  title?: string;
  /** The app version string (from package.json) the file is written with. */
  createdWith: string;
  now?: Date;
}

/** Assemble the version 1 document from the live state. Pure apart from the clock default. */
export function buildProject(o: BuildOptions): Project {
  const { screens } = o;
  const project: Project = {
    format: PROJECT_FORMAT,
    version: CURRENT_VERSION,
    createdWith: o.createdWith,
    savedAt: (o.now ?? new Date()).toISOString(),
    screens: {
      transport: transport.toProject(screens.transport),
      vadose: vadose.toProject(screens.vadose),
      saturated: saturated.toProject(screens.saturated),
      vapor: vapor.toProject(screens.vapor),
      surfaceWater: surfaceWater.toProject(screens.surfaceWater),
      risk: risk.toProject(screens.risk),
      cleanup: cleanup.toProject(screens.cleanup),
      household: household.toProject(screens.household),
      plantsEco: plantsEco.toProject(screens.plantsEco),
      uncertainty: uncertainty.toProject(screens.uncertainty),
    },
  };
  if (o.title !== undefined) project.title = o.title;
  if (o.feeds !== undefined) project.feeds = o.feeds;
  const ov = o.overrides === undefined ? undefined : overrides.toProject(o.overrides);
  if (ov !== undefined) project.overrides = ov;
  const st = o.site === undefined ? undefined : site.toProject(o.site);
  if (st !== undefined) project.site = st;
  if (o.data !== undefined) project.data = o.data;
  return project;
}

/** The project-level overrides of a loaded project; none when the file has no `overrides` key. */
export const overridesOf = (project: Project): OverridesState =>
  overrides.fromProject(project.overrides);

/** The advisory site model choices of a loaded project; the defaults when the file has no `site` key. */
export const siteOf = (project: Project): SiteState => site.fromProject(project.site);

/** A feed as stored: the value, the screen it came from and a fingerprint of that screen's form. */
export function feedEntry<V>(
  source: keyof Screens,
  sourceForm: unknown,
  value: V,
): { source: string; inputsHash: string; value: V } {
  return { source, inputsHash: hashInputs(fingerprintForm(source, sourceForm)), value };
}

/** True when the source form no longer matches the one the feed was built from. */
export function isFeedStale(
  entry: { inputsHash: string; source: string },
  currentSourceForm: unknown,
): boolean {
  const source = entry.source;
  return entry.inputsHash !== hashInputs(fingerprintForm(source, currentSourceForm));
}

export interface LoadWarning {
  path: string;
  message: string;
}

export type LoadResult =
  | { ok: true; project: Project; warnings: LoadWarning[]; droppedFeeds?: string[] }
  | { ok: false; error: string };

const NOT_A_PROJECT = 'This file is not a model_flow project.';

function pathText(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (acc, seg) =>
      typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg),
    '',
  );
}

/**
 * Read a project from file text or an already parsed value: check it is a project, refuse a newer
 * version than this build knows, migrate older ones in order, validate against the current schema,
 * and drop unknown keys with a warning. Never half loads: any failure returns an error and no project.
 */
export function parseProject(input: unknown): LoadResult {
  let doc: unknown = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch {
      return { ok: false, error: 'This file is not valid JSON.' };
    }
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { ok: false, error: NOT_A_PROJECT };
  }
  const raw = doc as Record<string, unknown>;
  if (raw['format'] !== PROJECT_FORMAT) return { ok: false, error: NOT_A_PROJECT };
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'The project file has no valid version number.' };
  }
  if (version > CURRENT_VERSION) {
    return {
      ok: false,
      error: `This project was saved by a newer version of the app (file format ${version}; this app reads up to ${CURRENT_VERSION}). Update the app to open it.`,
    };
  }
  let migrated: Record<string, unknown>;
  try {
    migrated = migrate(raw, CURRENT_VERSION);
  } catch (e) {
    return { ok: false, error: `The project could not be upgraded: ${(e as Error).message}.` };
  }
  const parsed = projectV1Schema.safeParse(migrated);
  if (!parsed.success) {
    const shown = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${pathText(i.path) || 'project'}: ${i.message}`);
    const more = parsed.error.issues.length - shown.length;
    return {
      ok: false,
      error: `The project file is not valid. ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`,
    };
  }
  const warnings = unknownKeyPaths(migrated, parsed.data, '').map((p) => {
    const path = p.replace(/^\./, '');
    return { path, message: `Ignored the unknown field "${path}".` };
  });
  const droppedFeeds: string[] = [];
  const { feeds: rawFeeds, ...rest } = parsed.data;
  const project: Project = rest;
  if (rawFeeds !== undefined) {
    // each feed is a convenience copy of a value passed between screens: an unusable one is dropped
    // and reported, and never costs the user the forms
    const kept: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(rawFeeds)) {
      const shape = (feedShapes as Record<string, z.ZodType | undefined>)[key];
      if (shape === undefined) {
        warnings.push({
          path: `feeds.${key}`,
          message: `Ignored the unknown field "feeds.${key}".`,
        });
        continue;
      }
      const r = shape.safeParse(entry);
      if (!r.success) {
        droppedFeeds.push(key);
        warnings.push({
          path: `feeds.${key}`,
          message: `Dropped the value passed between screens "${key}" because it was not usable; send it again from its source screen.`,
        });
        continue;
      }
      for (const p of unknownKeyPaths(entry, r.data, `feeds.${key}`)) {
        warnings.push({ path: p, message: `Ignored the unknown field "${p}".` });
      }
      kept[key] = r.data;
    }
    project.feeds = kept as Feeds;
  }
  return { ok: true, project, warnings, droppedFeeds };
}
