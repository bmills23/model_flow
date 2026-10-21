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
import {
  clearTransportFeed,
  getTransportFeed,
  subscribeTransportFeed,
} from '../transport/chainFeed';
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
import { clearModeledSummary } from '../cleanup/modeledSummary';
import { emptyOverrides, type OverridesState } from '../overrides/model';
import { defaultSite, type SiteState } from '../site/model';
import { decodeJson, encodeJson } from './codec';
import { hashInputs, stableStringify } from './hash';
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
/**
 * The last state the person has been warned about or has kept: it moves on a save, an open, a start AND
 * a restore of the autosave. It drives only the close or reload warning. `savedSnapshot` moves on a
 * save, an open or a start, never on a restore, so a restored project that was never saved to a file
 * still reads as unfiled when something is about to replace it.
 */
let warnedSnapshot: string | null = null;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Source form fingerprint recorded when each feed was last sent (or restored). */
let hashes: Partial<Record<StaleFeedKey, { source: string; inputsHash: string }>> = {};
/**
 * What each sent feed also depended on at send, besides its source form (see `heldInputs`). Kept in the
 * session only: it is not written to the file, so the file format and the fingerprints are unchanged.
 */
let heldBaseline: Partial<Record<StaleFeedKey, string>> = {};
/** The feeds whose sending inputs differ now from those recorded at send (see `recomputeStale`). */
let stale: StaleFeedKey[] = [];
/** True while a project is being put back, so the feed setters it runs do not notify half a state. */
let seeding = false;
/** Feeds a restored or opened project carried that could not be used and were dropped. */
let dropped: string[] = [];
const listeners = new Set<() => void>();
const staleListeners = new Set<() => void>();
const notify = (): void => listeners.forEach((fn) => fn());

export const subscribeProject = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getEpoch = (): number => epoch;
export const getScreen = <K extends keyof Screens>(key: K): Screens[K] => screens[key];
/**
 * A feed that screens pass on and that can go stale: the persisted feeds plus the groundwater run the
 * cleanup screen reads (`transportChain`), which lives in the session only.
 */
export type StaleFeedKey = FeedKey | 'transportChain';

/**
 * Live feed staleness. A held feed is stale while the inputs of the screen that sent it differ from
 * the inputs recorded when it was sent, or when a project was opened or restored. Editing the inputs
 * back, or sending again, clears it. The list keeps its identity until the set changes, so it can be
 * a `useSyncExternalStore` snapshot (see `useStaleFeeds`).
 */
export const getStaleFeeds = (): readonly StaleFeedKey[] => stale;
/** True when the held feed `key` is stale now (false when nothing is held under it). */
export const isFeedStaleNow = (key: StaleFeedKey): boolean => stale.includes(key);
/** Tell `fn` when the set of stale feeds changes; returns the unsubscribe. */
export const subscribeStale = (fn: () => void): (() => void) => {
  staleListeners.add(fn);
  return () => {
    staleListeners.delete(fn);
  };
};
export const getDroppedFeeds = (): readonly string[] => dropped;

function sourceForms(s: Screens): Record<StaleFeedKey, unknown> {
  return {
    transportChain: s.transport.form,
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
const SOURCE: Record<StaleFeedKey, string> = {
  transportChain: 'transport',
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

const readers: Record<StaleFeedKey, () => unknown> = {
  transportChain: getTransportFeed,
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

/** The feeds the project file carries (every feed but the session-only groundwater run). */
const PERSISTED = (Object.keys(readers) as StaleFeedKey[]).filter(
  (k): k is FeedKey => k !== 'transportChain',
);
const STALE_KEYS = Object.keys(readers) as StaleFeedKey[];

function currentFeeds(): Feeds {
  const forms = sourceForms(screens);
  const feeds: Record<string, Entry> = {};
  for (const key of PERSISTED) {
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

const startSnapshot = (): string =>
  stableStringify({
    screens: defaultScreens(),
    title: '',
    feeds: {},
    overrides: emptyOverrides(),
    site: defaultSite(),
  });

/**
 * True when the project differs from the last save, open, start or restore: the close or reload
 * warning. A reload that only brings the autosave back is not an unsaved change.
 */
export const hasUnsavedChanges = (): boolean =>
  snapshot() !== (warnedSnapshot ?? savedSnapshot ?? startSnapshot());

/**
 * True when the project differs from the last save to a file, open or start, whether or not it was
 * restored from the autosave since. Replacing the project (an opened file or a share link) asks first
 * on this, because the autosave is the only copy of unfiled work and the replace overwrites it.
 */
export const hasUnfiledChanges = (): boolean => snapshot() !== (savedSnapshot ?? startSnapshot());

/** Record the project as saved (after a download, an open or a start). */
export function markSaved(): void {
  savedSnapshot = snapshot();
  warnedSnapshot = savedSnapshot;
}

/** Record the project as restored from the autosave: quiet for the unload warning, still unfiled. */
function markRestored(): void {
  warnedSnapshot = snapshot();
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
  recomputeStale();
}

const contentKeys = new WeakMap<object, string>();
let contentCounter = 0;
/**
 * A short text that is equal for equal content of a held feed. It is worked out once per feed object,
 * so a feed that is only read costs nothing; a value that cannot be written as text is told apart by
 * identity instead (sending it again then reads as a change, which errs on the side of the mark).
 */
function contentKey(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (typeof value !== 'object') return String(value);
  const known = contentKeys.get(value);
  if (known !== undefined) return known;
  let key: string;
  try {
    key = hashInputs(value);
  } catch {
    contentCounter += 1;
    key = `object-${contentCounter}`;
  }
  contentKeys.set(value, key);
  return key;
}

/**
 * Inputs a sent feed was built from that are not in its source form: a setting kept beside the form
 * (the well method, the outdoor box, the source choice) and the feeds the sending screen reads from
 * other screens. A change here makes the feed stale just as a form edit does. Only the ones the
 * sending screen really reads are listed, so an unrelated edit does not mark a feed.
 */
function heldInputs(key: StaleFeedKey): unknown {
  const { transport, surfaceWater, saturated, vapor, household } = screens;
  const received = (): unknown => ({
    vadose: transport.form.feedFromVadose ? contentKey(getVadoseFeed()) : null,
    saturated: transport.form.feedFromSaturated ? contentKey(getSaturatedFeed()) : null,
  });
  switch (key) {
    case 'well':
    case 'vaporWaterTable':
      return { method: transport.method, received: received() };
    case 'bank':
    case 'transportChain':
      return { received: received() };
    case 'saturated':
    case 'vaporSaturated':
      return { method: saturated.method };
    case 'surfaceWater':
      return { bank: surfaceWater.form.linked ? contentKey(getBankFeed()) : null };
    case 'vaporRisk': {
      const series =
        vapor.choice === 'waterTable'
          ? getWaterTableFeed()
          : vapor.choice === 'vadose'
            ? getVadoseVaporFeed()
            : vapor.choice === 'saturated'
              ? getSaturatedVaporFeed()
              : null;
      return { outdoor: vapor.outdoor, choice: vapor.choice, series: contentKey(series) };
    }
    case 'household': {
      const f = household.form;
      const usesWell = f.showerWaterSource === 'well' || f.irrigationWaterSource === 'well';
      return {
        well: usesWell ? contentKey(getWellFeed()) : null,
        surface: f.irrigationWaterSource === 'surface' ? contentKey(getSurfaceWaterFeed()) : null,
      };
    }
    default:
      return null;
  }
}
const heldKey = (key: StaleFeedKey): string => stableStringify(heldInputs(key));

/** True while the sending inputs of the held feed `key` differ from those recorded at send. */
function isStaleNow(key: StaleFeedKey, forms: Record<StaleFeedKey, unknown>): boolean {
  if (readers[key]() === null) return false;
  const h = hashes[key];
  if (h === undefined) return false;
  if (h.inputsHash !== feedEntry(SOURCE[key] as keyof Screens, forms[key], 0).inputsHash) {
    return true;
  }
  const base = heldBaseline[key];
  return base !== undefined && base !== heldKey(key);
}

/** Work the stale list out again; tell subscribers only when the set changed. */
function recomputeStale(): void {
  if (seeding) return;
  const forms = sourceForms(screens);
  const next = STALE_KEYS.filter((k) => isStaleNow(k, forms));
  if (next.length === stale.length && next.every((k, i) => k === stale[i])) return;
  stale = next;
  staleListeners.forEach((fn) => fn());
}

function recordHash(key: StaleFeedKey): void {
  if (readers[key]() === null) {
    delete hashes[key];
    delete heldBaseline[key];
  } else {
    hashes[key] = {
      source: SOURCE[key],
      inputsHash: feedEntry(SOURCE[key] as keyof Screens, sourceForms(screens)[key], 0).inputsHash,
    };
    heldBaseline[key] = heldKey(key);
  }
  if (PERSISTED.includes(key as FeedKey)) schedule();
  recomputeStale();
}

let watching = false;
function watchFeeds(): void {
  if (watching) return;
  watching = true;
  subscribeWellFeed(() => recordHash('well'));
  subscribeBankFeed(() => recordHash('bank'));
  subscribeTransportFeed(() => recordHash('transportChain'));
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
  clearTransportFeed();
  // a kept modeled-source uncertainty summary belongs to the project it was computed in
  clearModeledSummary();
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
  heldBaseline = {};
  stale = [];
  dropped = [];
  savedSnapshot = null;
  warnedSnapshot = null;
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
  seeding = true;
  try {
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
    // a file records only the source form of each feed, so what else a feed read (held feeds, the
    // well method) is taken as it is now: an opened file reports exactly the form changes it always
    // did, and an edit after the open is what the live mark follows
    heldBaseline = {};
    for (const k of Object.keys(restored) as FeedKey[]) heldBaseline[k] = heldKey(k);
  } finally {
    seeding = false;
  }
  stale = [];
  recomputeStale();
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
  heldBaseline = {};
  dropped = [];
  recomputeStale();
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
  // seed the unload baseline from the restored state, so a reload alone is not an unsaved change and
  // the unload warning appears only once something is edited after the restore; the file baseline is
  // left alone, so opening a file or a link still asks before replacing a restored, unfiled project
  markRestored();
}
