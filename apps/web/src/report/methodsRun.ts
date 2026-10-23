import { stableStringify } from '../project/hash';
import { defaultScreens, type Screens } from '../project';
import * as cleanup from '../cleanup/project';
import * as household from '../household/project';
import * as plantsEco from '../plantsEco/project';
import { ECO_LEGACY_ID, ECO_MODERN_ID } from '../plantsEco/eco';
import { LEGACY_PLANT_ID, MODERN_PLANT_ID } from '../plantsEco/produce';
import { TPH_LEGACY_ID, TPH_MODERN_ID } from '../plantsEco/tph';
import * as risk from '../risk/project';
import * as saturated from '../saturated/project';
import * as surfaceWater from '../surfaceWater/project';
import * as transport from '../transport/project';
import * as uncertainty from '../uncertainty/project';
import * as vadose from '../vadose/project';
import * as vapor from '../vapor/project';
import type { DataEditions } from './methodsStatement';

export type ScreenKey = keyof Screens;

/** The order the report shows the screens in. */
export const USED_SCREENS_ORDER: readonly ScreenKey[] = [
  'transport',
  'vadose',
  'saturated',
  'vapor',
  'surfaceWater',
  'risk',
  'cleanup',
  'household',
  'plantsEco',
  'uncertainty',
];

/** The data editions this build ships (directory names under packages/data/generated). */
export const CURRENT_EDITIONS = {
  rsl: 'rsl-2024-11',
  nrwqc: 'nrwqc-2026-10-16',
  sediment: 'sediment-2026-10-16',
} as const satisfies Required<DataEditions>;

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

/**
 * The stored feeds of a project, as far as the report needs them: which screen each came from. A feed
 * about one chemical is an object of slots by chemical id, each with its source (format version 2).
 */
export type FeedsLike = Record<string, unknown>;

/** True when a stored feed, or one of its slots, was sent from screen `key`. */
function sentFrom(entry: unknown, key: string): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  if ('source' in entry && typeof entry.source === 'string') return entry.source === key;
  return Object.values(entry).some(
    (slot) => typeof slot === 'object' && slot !== null && 'source' in slot && slot.source === key,
  );
}

/**
 * A screen counts as used when its state differs from the defaults a new project starts with. A
 * project holds every screen key, so presence says nothing; an edit does.
 */
export function screenUsed(key: ScreenKey, screens: Screens, feeds?: FeedsLike): boolean {
  if (feeds !== undefined && Object.values(feeds).some((e) => sentFrom(e, key))) return true;
  const project = PROJECTORS[key] as (s: Screens[ScreenKey]) => unknown;
  const now = stableStringify(project(screens[key]));
  if (now === stableStringify(project(defaultScreens()[key]))) return false;
  // a file saved before wave R holds the old defaults (the regression for dispersivity), which load
  // as a form unlike the new defaults: an untouched old screen is still unused
  const old = preWaveRDefaults(key);
  return old === undefined || now !== stableStringify(project(old));
}

/** The screen a project saved before wave R holds when it was never edited, for the two that changed. */
function preWaveRDefaults(key: ScreenKey): Screens[ScreenKey] | undefined {
  const fresh = defaultScreens();
  if (key === 'transport') {
    return { ...fresh.transport, form: { ...fresh.transport.form, dispLaw: 'legacy' } };
  }
  if (key === 'vadose') {
    return { ...fresh.vadose, form: { ...fresh.vadose.form, dispersivityBasis: 'regression' } };
  }
  return undefined;
}

/**
 * The ids of the methods each used screen runs, from the screen's own rules: the screens run both
 * of their methods side by side, and a form choice adds or drops the optional ones.
 */
function idsFor(key: ScreenKey, s: Screens): string[] {
  switch (key) {
    case 'transport': {
      const f = s.transport.form;
      const ids = ['groundwater.at123d', 'groundwater.wexler1992'];
      if (f.showDomenico || s.transport.method === 'domenico') ids.push('groundwater.domenico1987');
      const entered = [f.alphaLOverride, f.alphaTOverride, f.alphaVOverride].every(
        (v) => v.trim() !== '',
      );
      if (!entered && f.dispLaw !== 'entered' && f.dispLaw !== 'ssg') {
        ids.push(
          f.dispLaw === 'legacy'
            ? 'dispersivity.gelhar1985-api1987'
            : f.dispLaw === 'modern'
              ? 'dispersivity.xu-eckstein1995'
              : 'dispersivity.schulze-makuch2005',
        );
      }
      return ids;
    }
    case 'vadose':
      return ['vadose.vadsat', 'vadose.layered'];
    case 'saturated':
      return ['saturatedSource.two-region', 'saturatedSource.exponential'];
    case 'vapor': {
      const ids = [
        'vapor.je-1991',
        'vapor.je-epa',
        'outdoorAir.box',
        'outdoorAir.ssg-vf-1996',
        'vapor.pvi-screen-2015',
      ];
      if (s.vapor.form.method === 'devaull') ids.push('vapor.devaull-2007');
      if (s.vapor.form.source !== 'soil') ids.push('vapor.attenuation-factor-2015');
      return ids;
    }
    case 'surfaceWater':
      return ['surfaceWater.well-mixed', 'surfaceWater.mass-discharge'];
    case 'risk':
      return ['exposure.rags-a-1989', 'exposure.rags-e-f-2014'];
    case 'cleanup': {
      const f = s.cleanup.form;
      const ids = ['cleanup.rags-b-1991', 'cleanup.rags-e-f-2014'];
      if (f.ssg.on) ids.push('cleanup.ssg-leaching');
      if (f.source !== 'direct') {
        // the chain runs both groundwater methods, and the soil source's own two methods
        ids.push('cleanup.modeled-chains', 'groundwater.at123d', 'groundwater.wexler1992');
        if (f.source === 'vadose') ids.push('vadose.vadsat', 'vadose.layered');
        if (f.source === 'saturated')
          ids.push('saturatedSource.two-region', 'saturatedSource.exponential');
      }
      return ids;
    }
    case 'household':
      return [
        'shower.fc-1986',
        'shower.little-1992',
        'shower.rsl-household',
        'irrigation.sprinkler-fc',
        'particulate.box-emission',
        'particulate.ssg-pef-1996',
        'particulate.ssg-pef-2002',
      ];
    case 'plantsEco': {
      const f = s.plantsEco.form;
      const ids = [LEGACY_PLANT_ID, MODERN_PLANT_ID, ECO_MODERN_ID];
      if (f.benchmarks.length > 0) ids.push(ECO_LEGACY_ID);
      if (f.tphTotal.trim() !== '' || f.tphFractions.length > 0) {
        ids.push(f.tphSet === 'tphcwg' ? TPH_LEGACY_ID : TPH_MODERN_ID);
      }
      return ids;
    }
    case 'uncertainty': {
      const u = s.uncertainty;
      const d = uncertainty.defaultUncertainty();
      const changed = (k: 'risk' | 'cleanup' | 'modeled'): boolean =>
        stableStringify(u[k]) !== stableStringify(d[k]);
      const ids: string[] = [];
      if (changed('risk')) {
        ids.push(u.risk.sampling === 'lhs' ? 'uncertainty.lhs-ic' : 'uncertainty.srs-exposure');
        if (u.risk.sobol) ids.push('uncertainty.sobol-saltelli');
      }
      // the direct-source and modeled-source panels both run the probabilistic cleanup method
      if (changed('cleanup') || changed('modeled')) ids.push('uncertainty.cleanup-probabilistic');
      return ids;
    }
  }
}

export interface MethodsRun {
  /** Method ids per used screen. */
  byScreen: Partial<Record<ScreenKey, string[]>>;
  /** Every id once, in screen order. */
  ids: string[];
}

export function methodsRun(screens: Screens, feeds?: FeedsLike): MethodsRun {
  const byScreen: MethodsRun['byScreen'] = {};
  const ids: string[] = [];
  for (const key of USED_SCREENS_ORDER) {
    if (!screenUsed(key, screens, feeds)) continue;
    const list = idsFor(key, screens);
    byScreen[key] = list;
    for (const id of list) if (!ids.includes(id)) ids.push(id);
  }
  return { byScreen, ids };
}

const READS: Record<keyof DataEditions, readonly ScreenKey[]> = {
  rsl: ['risk', 'cleanup', 'plantsEco', 'uncertainty'],
  nrwqc: ['surfaceWater'],
  sediment: ['surfaceWater'],
};

/** Editions of the datasets the used screens read; an edition the project recorded wins. */
export function dataEditionsFor(
  byScreen: MethodsRun['byScreen'],
  recorded?: DataEditions,
): DataEditions {
  const out: DataEditions = {};
  for (const kind of Object.keys(READS) as (keyof DataEditions)[]) {
    if (!READS[kind].some((k) => byScreen[k] !== undefined)) continue;
    out[kind] = recorded?.[kind] ?? CURRENT_EDITIONS[kind];
  }
  return out;
}
