import pkg from '../../package.json';
import {
  clearHouseholdFeed,
  getHouseholdFeed,
  setHouseholdFeed,
  subscribeHouseholdFeed,
} from '../household/feeds';
import {
  clearProduceFeed,
  clearTphFeed,
  getProduceFeed,
  getTphFeed,
  setProduceFeed,
  setTphFeed,
  subscribeProduceFeed,
  subscribeTphFeed,
} from '../plantsEco/feeds';
import {
  clearSaturatedFeed,
  getSaturatedFeed,
  setSaturatedFeed,
  subscribeSaturatedFeed,
} from '../saturated/feed';
import {
  clearSurfaceWaterFeed,
  getSurfaceWaterFeed,
  setSurfaceWaterFeed,
  subscribeSurfaceWaterFeed,
} from '../surfaceWater/feed';
import { clearBankFeed, getBankFeed, setBankFeed, subscribeBankFeed } from '../transport/bankFeed';
import { clearWellFeed, getWellFeed, setWellFeed, subscribeWellFeed } from '../transport/wellFeed';
import { clearVadoseFeed, getVadoseFeed, setVadoseFeed, subscribeVadoseFeed } from '../vadose/feed';
import {
  clearSaturatedVaporFeed,
  clearVadoseVaporFeed,
  clearVaporRiskFeed,
  clearWaterTableFeed,
  getSaturatedVaporFeed,
  getVadoseVaporFeed,
  getVaporRiskFeed,
  getWaterTableFeed,
  setSaturatedVaporFeed,
  setVadoseVaporFeed,
  setVaporRiskFeed,
  setWaterTableFeed,
  subscribeSaturatedVaporFeed,
  subscribeVadoseVaporFeed,
  subscribeVaporRiskFeed,
  subscribeWaterTableFeed,
} from '../vapor/feeds';
import { emptyOverrides, type OverridesState } from '../overrides/model';
import { defaultSite, type SiteState } from '../site/model';
import { decodeJson, encodeJson } from './codec';
import { stableStringify } from './hash';
import { scrubRejected } from '../ui/decimalComma';
import {
  buildProject,
  defaultScreens,
  feedEntry,
  parseProject,
  screensOf,
  overridesOf,
  siteOf,
  type Feeds,
  type Project,
  type Screens,
} from './index';

/** The one versioned localStorage key the current project autosaves under. */
export const AUTOSAVE_KEY = 'model_flow.project.autosave.v1';
const DEBOUNCE_MS = 600;
const APP_VERSION: string = pkg.version;

type FeedKey = keyof Feeds;
type Entry = { source: string; inputsHash: string; value: unknown };

let screens: Screens = defaultScreens();
let title = '';
/** Project-level overrides (see overrides/); the same value shows on every screen that reads it. */
let overrides: OverridesState = emptyOverrides();
/** The advisory site model choices (see site/); they change no result. */
let site: SiteState = defaultSite();
/** Fingerprint of the project as last saved, opened or started; the unsaved-changes check compares to it. */
let savedSnapshot: string | null = null;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Source form fingerprint recorded when each feed was last sent (or restored). */
let hashes: Partial<Record<FeedKey, { source: string; inputsHash: string }>> = {};
let stale: FeedKey[] = [];
/** Feeds a restored or opened project carried that could not be used and were dropped. */
let dropped: string[] = [];
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((fn) => fn());

export const subscribeProject = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getEpoch = (): number => epoch;
export const getScreen = <K extends keyof Screens>(key: K): Screens[K] => screens[key];
/** Feeds restored from storage whose source form has changed since they were built. */
export const getStaleFeeds = (): readonly FeedKey[] => stale;
export const getDroppedFeeds = (): readonly string[] => dropped;

function sourceForms(s: Screens): Record<FeedKey, unknown> {
  return {
    well: s.transport.form,
    bank: s.transport.form,
    surfaceWater: s.surfaceWater.form,
    vadose: s.vadose.form,
    saturated: s.saturated.form,
    vaporVadose: s.vadose.form,
    vaporWaterTable: s.transport.form,
    vaporSaturated: s.saturated.form,
    vaporRisk: s.vapor.form,
    household: s.household.form,
    produce: s.plantsEco.form,
    tph: s.plantsEco.form,
  };
}
const SOURCE: Record<FeedKey, string> = {
  well: 'transport',
  bank: 'transport',
  surfaceWater: 'surfaceWater',
  vadose: 'vadose',
  saturated: 'saturated',
  vaporVadose: 'vadose',
  vaporWaterTable: 'transport',
  vaporSaturated: 'saturated',
  vaporRisk: 'vapor',
  household: 'household',
  produce: 'plantsEco',
  tph: 'plantsEco',
};

const readers: Record<FeedKey, () => unknown> = {
  well: getWellFeed,
  surfaceWater: getSurfaceWaterFeed,
  vadose: getVadoseFeed,
  saturated: getSaturatedFeed,
  bank: getBankFeed,
  vaporVadose: getVadoseVaporFeed,
  vaporWaterTable: getWaterTableFeed,
  vaporSaturated: getSaturatedVaporFeed,
  vaporRisk: getVaporRiskFeed,
  household: getHouseholdFeed,
  produce: getProduceFeed,
  tph: getTphFeed,
};

function currentFeeds(): Feeds {
  const forms = sourceForms(screens);
  const feeds: Record<string, Entry> = {};
  for (const key of Object.keys(readers) as FeedKey[]) {
    const value = readers[key]();
    if (value === null) continue;
    const h = hashes[key];
    const entry =
      h !== undefined
        ? { source: h.source, inputsHash: h.inputsHash, value: encodeJson(value) }
        : feedEntry(SOURCE[key] as keyof Screens, forms[key], encodeJson(value));
    feeds[key] = entry;
  }
  return feeds as unknown as Feeds;
}

function build(): ReturnType<typeof buildProject> {
  return buildProject({
    screens: scrubRejected(screens),
    feeds: currentFeeds(),
    overrides,
    site,
    createdWith: APP_VERSION,
    ...(title !== '' ? { title } : {}),
  });
}

/** The live project as the file and the autosave hold it. */
export const currentProject = build;

function snapshot(): string {
  return stableStringify({ screens, title, feeds: currentFeeds(), overrides, site });
}

/** True when the project differs from the last save, open or start. */
export const hasUnsavedChanges = (): boolean =>
  snapshot() !==
  (savedSnapshot ??
    stableStringify({
      screens: defaultScreens(),
      title: '',
      feeds: {},
      overrides: emptyOverrides(),
      site: defaultSite(),
    }));
/** Record the project as saved (after a download, an open or a start). */
export function markSaved(): void {
  savedSnapshot = snapshot();
}

export const getOverrides = (): OverridesState => overrides;
/** Replace the project's overrides; subscribers (the screens that show or use them) are told. */
export function setOverrides(next: OverridesState): void {
  if (stableStringify(next) === stableStringify(overrides)) return;
  overrides = next;
  schedule();
  notify();
}

export const getSite = (): SiteState => site;
/** Replace the site model choices; subscribers are told. */
export function setSite(next: SiteState): void {
  if (stableStringify(next) === stableStringify(site)) return;
  site = next;
  schedule();
  notify();
}

export const getTitle = (): string => title;
export function setTitle(next: string): void {
  if (next === title) return;
  title = next;
  schedule();
  notify();
}

function write(): void {
  timer = null;
  try {
    const project = build();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // a private window or a full quota: carry on without the autosave
  }
}

function schedule(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(write, DEBOUNCE_MS);
}

/** Write the autosave now (also used by tests). */
export function flushAutosave(): void {
  if (timer !== null) clearTimeout(timer);
  write();
}

/** Record a screen's live state; unchanged state is ignored so a remount does not cause a write. */
export function setScreen<K extends keyof Screens>(key: K, value: Screens[K]): void {
  if (stableStringify(screens[key]) === stableStringify(value)) return;
  screens = { ...screens, [key]: value };
  schedule();
}

function recordHash(key: FeedKey): void {
  if (readers[key]() === null) {
    delete hashes[key];
  } else {
    hashes[key] = {
      source: SOURCE[key],
      inputsHash: feedEntry(SOURCE[key] as keyof Screens, sourceForms(screens)[key], 0).inputsHash,
    };
  }
  schedule();
}

let watching = false;
function watchFeeds(): void {
  if (watching) return;
  watching = true;
  subscribeWellFeed(() => recordHash('well'));
  subscribeBankFeed(() => recordHash('bank'));
  subscribeSurfaceWaterFeed(() => recordHash('surfaceWater'));
  subscribeVadoseFeed(() => recordHash('vadose'));
  subscribeSaturatedFeed(() => recordHash('saturated'));
  subscribeVadoseVaporFeed(() => recordHash('vaporVadose'));
  subscribeWaterTableFeed(() => recordHash('vaporWaterTable'));
  subscribeSaturatedVaporFeed(() => recordHash('vaporSaturated'));
  subscribeVaporRiskFeed(() => recordHash('vaporRisk'));
  subscribeHouseholdFeed(() => recordHash('household'));
  subscribeProduceFeed(() => recordHash('produce'));
  subscribeTphFeed(() => recordHash('tph'));
}
watchFeeds();

function clearAllFeeds(): void {
  clearWellFeed();
  clearBankFeed();
  clearSurfaceWaterFeed();
  clearVadoseFeed();
  clearSaturatedFeed();
  clearVadoseVaporFeed();
  clearWaterTableFeed();
  clearSaturatedVaporFeed();
  clearVaporRiskFeed();
  clearHouseholdFeed();
  clearProduceFeed();
  clearTphFeed();
}

/** Drop in-memory state back to defaults without touching storage (a simulated reload in tests). */
export function forgetMemory(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  screens = defaultScreens();
  title = '';
  overrides = emptyOverrides();
  site = defaultSite();
  hashes = {};
  stale = [];
  dropped = [];
  savedSnapshot = null;
}

/**
 * Read the autosave and seed the screens and feeds from it. Called once before the first render. A
 * missing, unreadable, corrupt, foreign or newer save leaves today's behaviour (a fresh project).
 */
export function hydrate(): void {
  let text: string | null;
  try {
    text = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return;
  }
  if (text === null) return;
  const r = parseProject(text);
  if (!r.ok) return;
  seed(r.project, r.droppedFeeds ?? []);
  notify();
}

/**
 * Put a parsed project into the screens and feeds. The screens always seed; a feed that cannot be
 * put back is dropped on its own (and listed) without touching the others.
 */
function seed(project: Project, droppedKeys: readonly string[] = []): void {
  screens = screensOf(project);
  overrides = overridesOf(project);
  site = siteOf(project);
  title = project.title ?? '';
  dropped = [...droppedKeys];
  const feeds = (project.feeds ?? {}) as Record<string, Entry | undefined>;
  const restored: Partial<Record<FeedKey, { source: string; inputsHash: string }>> = {};
  const val = (k: FeedKey): never => decodeJson(feeds[k]?.value) as never;
  const setters: Record<FeedKey, (v: never) => void> = {
    well: setWellFeed,
    bank: setBankFeed,
    surfaceWater: setSurfaceWaterFeed,
    vadose: setVadoseFeed,
    saturated: setSaturatedFeed,
    vaporVadose: setVadoseVaporFeed,
    vaporWaterTable: setWaterTableFeed,
    vaporSaturated: setSaturatedVaporFeed,
    vaporRisk: setVaporRiskFeed,
    household: setHouseholdFeed,
    produce: setProduceFeed,
    tph: setTphFeed,
  };
  for (const k of Object.keys(setters) as FeedKey[]) {
    const e = feeds[k];
    if (!e) continue;
    try {
      setters[k](val(k));
      restored[k] = { source: e.source, inputsHash: e.inputsHash };
    } catch {
      dropped.push(k);
    }
  }
  // the setters above recorded fresh hashes; put back the ones the file carried
  hashes = restored;
  const forms = sourceForms(screens);
  stale = (Object.keys(restored) as FeedKey[]).filter(
    (k) =>
      restored[k]?.inputsHash !== feedEntry(SOURCE[k] as keyof Screens, forms[k], 0).inputsHash,
  );
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * Replace the whole project with an opened file or shared link: forms, title and feeds (a project
 * without feeds clears the old ones). Mounted screens remount through the epoch. The result counts as
 * saved, and the autosave follows.
 */
export function loadProject(project: Project, droppedKeys: readonly string[] = []): void {
  clearAllFeeds();
  seed(project, droppedKeys);
  markSaved();
  epoch += 1;
  schedule();
  notify();
}

/** Clear the forms, the feeds and the autosave. Mounted screens remount through the epoch. */
export function newProject(): void {
  screens = defaultScreens();
  title = '';
  overrides = emptyOverrides();
  site = defaultSite();
  clearAllFeeds();
  hashes = {};
  stale = [];
  dropped = [];
  if (timer !== null) clearTimeout(timer);
  timer = null;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // nothing stored, or storage blocked
  }
  markSaved();
  epoch += 1;
  notify();
}

let hideWatched = false;
/** A debounce timer dies with the page: write the pending edit when the page is hidden or leaves. */
function watchPageHide(): void {
  if (hideWatched || typeof window === 'undefined') return;
  hideWatched = true;
  const flushPending = (): void => {
    if (timer !== null) flushAutosave();
  };
  window.addEventListener('pagehide', flushPending);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
  });
}

/** Seed from storage; call once before the first render. */
export function startProjectStore(): void {
  hydrate();
  watchPageHide();
  // seed the saved snapshot from the restored state, so a reload alone is not an unsaved change;
  // the unload warning appears only once something is edited after the restore
  markSaved();
}
