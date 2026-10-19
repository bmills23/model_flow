import pkg from '../../package.json';
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
import { decodeJson, encodeJson } from './codec';
import { stableStringify } from './hash';
import {
  buildProject,
  defaultScreens,
  feedEntry,
  parseProject,
  screensOf,
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
/** Fingerprint of the project as last saved, opened or started; the unsaved-changes check compares to it. */
let savedSnapshot: string | null = null;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Source form fingerprint recorded when each feed was last sent (or restored). */
let hashes: Partial<Record<FeedKey, { source: string; inputsHash: string }>> = {};
let stale: FeedKey[] = [];
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

function sourceForms(s: Screens): Record<FeedKey, unknown> {
  return {
    well: s.transport.form,
    bank: s.transport.form,
    surfaceWater: s.surfaceWater.form,
    vadose: s.vadose.form,
    saturated: s.saturated.form,
    // the vapor feeds come from four screens; any of them changing makes the entry stale
    vapor: [s.vadose.form, s.saturated.form, s.transport.form, s.vapor.form],
  };
}
const SOURCE: Record<FeedKey, string> = {
  well: 'transport',
  bank: 'transport',
  surfaceWater: 'surfaceWater',
  vadose: 'vadose',
  saturated: 'saturated',
  vapor: 'vapor',
};

function vaporValue(): Record<string, unknown> | null {
  const v = {
    vadose: getVadoseVaporFeed(),
    waterTable: getWaterTableFeed(),
    saturated: getSaturatedVaporFeed(),
    risk: getVaporRiskFeed(),
  };
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = val;
  return Object.keys(out).length === 0 ? null : out;
}

const readers: Record<FeedKey, () => unknown> = {
  well: getWellFeed,
  surfaceWater: getSurfaceWaterFeed,
  vadose: getVadoseFeed,
  saturated: getSaturatedFeed,
  bank: getBankFeed,
  vapor: vaporValue,
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
    screens,
    feeds: currentFeeds(),
    createdWith: APP_VERSION,
    ...(title !== '' ? { title } : {}),
  });
}

/** The live project as the file and the autosave hold it. */
export const currentProject = build;

function snapshot(): string {
  return stableStringify({ screens, title, feeds: currentFeeds() });
}

/** True when the project differs from the last save, open or start. */
export const hasUnsavedChanges = (): boolean =>
  snapshot() !==
  (savedSnapshot ?? stableStringify({ screens: defaultScreens(), title: '', feeds: {} }));
/** Record the project as saved (after a download, an open or a start). */
export function markSaved(): void {
  savedSnapshot = snapshot();
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
  for (const sub of [
    subscribeVadoseVaporFeed,
    subscribeWaterTableFeed,
    subscribeSaturatedVaporFeed,
    subscribeVaporRiskFeed,
  ]) {
    sub(() => recordHash('vapor'));
  }
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
}

/** Drop in-memory state back to defaults without touching storage (a simulated reload in tests). */
export function forgetMemory(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  screens = defaultScreens();
  title = '';
  hashes = {};
  stale = [];
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
  seed(r.project);
  notify();
}

/** Put a parsed project into the screens and feeds. Falls back to a fresh project if a feed is unusable. */
function seed(project: Project): void {
  try {
    screens = screensOf(project);
    title = project.title ?? '';
    const feeds = (project.feeds ?? {}) as Record<string, Entry | undefined>;
    const restored: Partial<Record<FeedKey, { source: string; inputsHash: string }>> = {};
    const val = (k: FeedKey): never => decodeJson(feeds[k]?.value) as never;
    const note = (k: FeedKey): void => {
      const e = feeds[k];
      if (e) restored[k] = { source: e.source, inputsHash: e.inputsHash };
    };
    if (feeds['well']) setWellFeed(val('well'));
    if (feeds['bank']) setBankFeed(val('bank'));
    if (feeds['surfaceWater']) setSurfaceWaterFeed(val('surfaceWater'));
    if (feeds['vadose']) setVadoseFeed(val('vadose'));
    if (feeds['saturated']) setSaturatedFeed(val('saturated'));
    if (feeds['vapor']) {
      const v = val('vapor') as Record<string, never | undefined>;
      if (v.vadose) setVadoseVaporFeed(v.vadose);
      if (v.waterTable) setWaterTableFeed(v.waterTable);
      if (v.saturated) setSaturatedVaporFeed(v.saturated);
      if (v.risk) setVaporRiskFeed(v.risk);
    }
    for (const k of Object.keys(feeds) as FeedKey[]) note(k);
    // the setters above recorded fresh hashes; put back the ones the file carried
    hashes = restored;
    const forms = sourceForms(screens);
    stale = (Object.keys(restored) as FeedKey[]).filter(
      (k) =>
        restored[k]?.inputsHash !== feedEntry(SOURCE[k] as keyof Screens, forms[k], 0).inputsHash,
    );
  } catch {
    screens = defaultScreens();
    title = '';
    hashes = {};
    stale = [];
    clearAllFeeds();
  }
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * Replace the whole project with an opened file or shared link: forms, title and feeds (a project
 * without feeds clears the old ones). Mounted screens remount through the epoch. The result counts as
 * saved, and the autosave follows.
 */
export function loadProject(project: Project): void {
  clearAllFeeds();
  seed(project);
  markSaved();
  epoch += 1;
  schedule();
  notify();
}

/** Clear the forms, the feeds and the autosave. Mounted screens remount through the epoch. */
export function newProject(): void {
  screens = defaultScreens();
  title = '';
  clearAllFeeds();
  hashes = {};
  stale = [];
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

/** Seed from storage; call once before the first render. */
export function startProjectStore(): void {
  hydrate();
  // the autosave is not a saved file: compare against a blank project, so a restored one is unsaved
  savedSnapshot = null;
}
