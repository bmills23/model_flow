import { stableStringify } from '../project/hash';
import { defaultScreens, type Screens } from '../project';
import * as cleanup from '../cleanup/project';
import * as risk from '../risk/project';
import * as saturated from '../saturated/project';
import * as surfaceWater from '../surfaceWater/project';
import * as transport from '../transport/project';
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
};

/**
 * A screen counts as used when its state differs from the defaults a new project starts with. A
 * project holds all seven screen keys, so presence says nothing; an edit does.
 */
export function screenUsed(key: ScreenKey, screens: Screens): boolean {
  const project = PROJECTORS[key] as (s: Screens[ScreenKey]) => unknown;
  return stableStringify(project(screens[key])) !== stableStringify(project(defaultScreens()[key]));
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
      if (!entered) {
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
      if (f.source !== 'direct') ids.push('cleanup.modeled-chains');
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

export function methodsRun(screens: Screens): MethodsRun {
  const byScreen: MethodsRun['byScreen'] = {};
  const ids: string[] = [];
  for (const key of USED_SCREENS_ORDER) {
    if (!screenUsed(key, screens)) continue;
    const list = idsFor(key, screens);
    byScreen[key] = list;
    for (const id of list) if (!ids.includes(id)) ids.push(id);
  }
  return { byScreen, ids };
}

const READS: Record<keyof DataEditions, readonly ScreenKey[]> = {
  rsl: ['risk', 'cleanup'],
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
