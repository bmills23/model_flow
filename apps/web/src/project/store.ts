import pkg from '../../package.json';
import {
  clearHouseholdFeed,
  getHouseholdFeedSlots,
  setHouseholdFeed,
  subscribeHouseholdFeed,
} from '../household/feeds';
import {
  clearProduceFeed,
  clearTphFeed,
  getProduceFeedSlots,
  getTphFeed,
  setProduceFeed,
  setTphFeed,
  subscribeProduceFeed,
  subscribeTphFeed,
} from '../plantsEco/feeds';
import {
  clearSaturatedFeed,
  getSaturatedFeedSlots,
  setSaturatedFeed,
  subscribeSaturatedFeed,
} from '../saturated/feed';
import {
  clearSurfaceWaterFeed,
  getSurfaceWaterFeedSlots,
  setSurfaceWaterFeed,
  subscribeSurfaceWaterFeed,
} from '../surfaceWater/feed';
import {
  clearBankFeed,
  getBankFeedSlots,
  setBankFeed,
  subscribeBankFeed,
} from '../transport/bankFeed';
import {
  clearTransportFeed,
  getTransportFeedSlots,
  setTransportFeed,
  subscribeTransportFeed,
} from '../transport/chainFeed';
import {
  clearWellFeed,
  getWellFeedSlots,
  setWellFeed,
  subscribeWellFeed,
} from '../transport/wellFeed';
import {
  clearVadoseFeed,
  getVadoseFeedSlots,
  setVadoseFeed,
  subscribeVadoseFeed,
} from '../vadose/feed';
import {
  clearSaturatedVaporFeed,
  clearVadoseVaporFeed,
  clearVaporRiskFeed,
  clearWaterTableFeed,
  getSaturatedVaporFeedSlots,
  getVadoseVaporFeedSlots,
  getVaporRiskFeedSlots,
  getWaterTableFeedSlots,
  setSaturatedVaporFeed,
  setVadoseVaporFeed,
  setVaporRiskFeed,
  setWaterTableFeed,
  subscribeSaturatedVaporFeed,
  subscribeVadoseVaporFeed,
  subscribeVaporRiskFeed,
  subscribeWaterTableFeed,
} from '../vapor/feeds';
import { clearChemicalSlots } from '../vapor/feedStore';
import { clearModeledSummary } from '../cleanup/modeledSummary';
import { emptyOverrides, type OverridesState } from '../overrides/model';
import { defaultSite, type SiteState } from '../site/model';
import type { SavedModeledLevels } from '../cleanup/modeledLevels';
import { chemicalIdsOf, deriveChemicals } from './chemicals';
import { decodeJson, encodeJson } from './codec';
import { withoutRunInputs } from './runInputs';
import { pickSlot, resolveSlot, slotOf, slotOfValue, type FeedSlots } from './feedSlots';
import { hashInputs, stableStringify } from './hash';
import { isChemicalFeed } from './schema';
import { scrubRejected } from '../ui/decimalComma';
import {
  buildProject,
  CURRENT_VERSION,
  PROJECT_FORMAT,
  chemicalsOf,
  defaultScreens,
  feedEntry,
  parseProject,
  screensOf,
  overridesOf,
  siteOf,
  modeledLevelsOf,
  type Feeds,
  type Project,
  type ProjectChemical,
  type Screens,
} from './index';

/**
 * The localStorage key the current project autosaves under. It moved to .v2 with project file format
 * version 2, so a tab still running a version 1 build never reads or writes it.
 */
export const AUTOSAVE_KEY = 'model_flow.project.autosave.v2';
/** The key the version 1 build used: read once to migrate, never written or removed here. */
export const LEGACY_AUTOSAVE_KEY = 'model_flow.project.autosave.v1';
const NEWER_NOTICE =
  'The saved copy in this browser was saved by a newer version of the app. This tab will not save over it.';
/** Set when the autosave this build read holds a newer file version: this tab then never writes it. */
let autosaveBlocked = false;
export const getAutosaveNotice = (): string | null => (autosaveBlocked ? NEWER_NOTICE : null);
function isTooNew(text: string): boolean {
  try {
    const doc = JSON.parse(text) as { format?: unknown; version?: unknown };
    return (
      doc?.format === PROJECT_FORMAT &&
      typeof doc.version === 'number' &&
      doc.version > CURRENT_VERSION
    );
  } catch {
    return false;
  }
}
const DEBOUNCE_MS = 600;
const APP_VERSION: string = pkg.version;

type FeedKey = keyof Feeds;
type Entry = { source: string; inputsHash: string; value: unknown };
type Hash = { source: string; inputsHash: string };

let screens: Screens = defaultScreens();
let title = '';
/** Project-level overrides (see overrides/); the same value shows on every screen that reads it. */
let overrides: OverridesState = emptyOverrides();
/** The advisory site model choices (see site/); they change no result. */
let site: SiteState = defaultSite();
/**
 * The project chemical list. It is stored and edited, not derived live: a screen choosing a chemical
 * that newly appears adds it (see `setScreen`), and only `removeChemical` takes one out, so removing
 * an entry a screen still names is not undone by the next edit. Absent in an older file, it is derived
 * once on open (see `chemicalsOf`).
 */
let chemicals: ProjectChemical[] = [];
/**
 * The modeled cleanup levels the cleanup screen solved, by chemical id, with the project (wave AA). The
 * groundwater run they came through is not saved, so these are what the report prints.
 */
let modeledLevels: Record<string, SavedModeledLevels> = {};
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
/** Source form fingerprint recorded when each slot of each feed was last sent (or restored). */
let hashes: Partial<Record<StaleFeedKey, Record<string, Hash>>> = {};
/**
 * What each sent slot also depended on at send, besides its source form (see `heldInputs`). Kept in
 * the session only: it is not written to the file, so the file format and the fingerprints are unchanged.
 */
let heldBaseline: Partial<Record<StaleFeedKey, Record<string, string>>> = {};
/** The slots whose sending inputs differ now from those recorded at send (see `recomputeStale`). */
let stale: readonly StaleSlot[] = [];
/** The feeds with at least one stale slot, in feed order (see `getStaleFeeds`). */
let staleKeys: readonly StaleFeedKey[] = [];
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
 * One held slot of a feed: the feed and the chemical it was sent for (the empty text for a value sent
 * while its screen's chemical was typed by hand, and for the TPH feed, which has one slot).
 */
export interface StaleSlot {
  feed: StaleFeedKey;
  chemicalId: string;
}

/**
 * What a consumer reads: a feed, for a chemical. A blank or absent chemical (a screen typed by hand,
 * the TPH feed) reads whichever slot it is given (see `feedSlots.resolveSlot`).
 */
export interface FeedRead {
  feed: StaleFeedKey;
  chemicalId?: string | undefined;
}

/**
 * True when the stale `slot` is one the consumer `read` takes values from: its own chemical's slot,
 * or the untagged slot (read when its own is not held; it errs on the side of the mark when both are),
 * or any slot of the feed for a read with no chemical.
 */
export function readMatches(read: FeedRead, slot: StaleSlot): boolean {
  if (read.feed !== slot.feed) return false;
  const own = slotOf(read.chemicalId);
  return own === '' || slot.chemicalId === own || slot.chemicalId === '';
}

/**
 * Live staleness, per slot (feed and chemical). A held slot is stale while the inputs of the screen
 * that sent it differ from the inputs recorded when it was sent, or when a project was opened or
 * restored. Editing the inputs back, or sending again, clears it. A slot is checked while its screen is
 * set to the slot's chemical; while the screen is on another chemical the slot keeps the mark it had
 * (the screen no longer shows that chemical's inputs), and it is checked again once the screen is set
 * back. The list keeps its identity until the set changes, so it can be a `useSyncExternalStore`
 * snapshot (see `useStaleSlots`).
 */
export const getStaleSlots = (): readonly StaleSlot[] => stale;
/** The feeds with at least one stale slot (a stable array until the set changes). */
export const getStaleFeeds = (): readonly StaleFeedKey[] => staleKeys;
/**
 * True when the held feed `key` is stale now for a consumer of `chemicalId` (see `readMatches`); with
 * no chemical, when any slot of it is stale. False when nothing is held under it.
 */
export const isFeedStaleNow = (key: StaleFeedKey, chemicalId?: string): boolean =>
  stale.some((s) => readMatches({ feed: key, chemicalId }, s));
/** Tell `fn` when the set of stale slots changes; returns the unsubscribe. */
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

interface FeedAccess {
  slots: () => FeedSlots<unknown>;
  set: (value: never) => void;
  clear: () => void;
  /** A chemical feed tells the slot a send wrote; the TPH feed tells nothing (it has one slot). */
  subscribe: (fn: (slot?: string) => void) => () => void;
}

/** The TPH feed holds one value; seen as slots, it is one untagged slot (the same Map until it changes). */
function singleSlots(get: () => unknown): () => FeedSlots<unknown> {
  let last: unknown = null;
  let map: FeedSlots<unknown> = new Map();
  return () => {
    const v = get();
    if (v !== last) {
      last = v;
      map = v === null ? new Map() : new Map([['', v]]);
    }
    return map;
  };
}

const FEEDS: Record<StaleFeedKey, FeedAccess> = {
  transportChain: {
    slots: getTransportFeedSlots,
    set: setTransportFeed,
    clear: clearTransportFeed,
    subscribe: subscribeTransportFeed,
  },
  well: {
    slots: getWellFeedSlots,
    set: setWellFeed,
    clear: clearWellFeed,
    subscribe: subscribeWellFeed,
  },
  surfaceWater: {
    slots: getSurfaceWaterFeedSlots,
    set: setSurfaceWaterFeed,
    clear: clearSurfaceWaterFeed,
    subscribe: subscribeSurfaceWaterFeed,
  },
  vadose: {
    slots: getVadoseFeedSlots,
    set: setVadoseFeed,
    clear: clearVadoseFeed,
    subscribe: subscribeVadoseFeed,
  },
  saturated: {
    slots: getSaturatedFeedSlots,
    set: setSaturatedFeed,
    clear: clearSaturatedFeed,
    subscribe: subscribeSaturatedFeed,
  },
  bank: {
    slots: getBankFeedSlots,
    set: setBankFeed,
    clear: clearBankFeed,
    subscribe: subscribeBankFeed,
  },
  vaporVadose: {
    slots: getVadoseVaporFeedSlots,
    set: setVadoseVaporFeed,
    clear: clearVadoseVaporFeed,
    subscribe: subscribeVadoseVaporFeed,
  },
  vaporWaterTable: {
    slots: getWaterTableFeedSlots,
    set: setWaterTableFeed,
    clear: clearWaterTableFeed,
    subscribe: subscribeWaterTableFeed,
  },
  vaporSaturated: {
    slots: getSaturatedVaporFeedSlots,
    set: setSaturatedVaporFeed,
    clear: clearSaturatedVaporFeed,
    subscribe: subscribeSaturatedVaporFeed,
  },
  vaporRisk: {
    slots: getVaporRiskFeedSlots,
    set: setVaporRiskFeed,
    clear: clearVaporRiskFeed,
    subscribe: subscribeVaporRiskFeed,
  },
  household: {
    slots: getHouseholdFeedSlots,
    set: setHouseholdFeed,
    clear: clearHouseholdFeed,
    subscribe: subscribeHouseholdFeed,
  },
  produce: {
    slots: getProduceFeedSlots,
    set: setProduceFeed,
    clear: clearProduceFeed,
    subscribe: subscribeProduceFeed,
  },
  tph: {
    slots: singleSlots(getTphFeed),
    set: setTphFeed,
    clear: clearTphFeed,
    subscribe: subscribeTphFeed,
  },
};

/** The feeds the project file carries (every feed but the session-only groundwater run). */
const PERSISTED = (Object.keys(FEEDS) as StaleFeedKey[]).filter(
  (k): k is FeedKey => k !== 'transportChain',
);
const STALE_KEYS = Object.keys(FEEDS) as StaleFeedKey[];

const hashOf = (key: StaleFeedKey, chemical: string): Hash | undefined => hashes[key]?.[chemical];

function currentFeeds(): Feeds {
  const forms = sourceForms(screens);
  const feeds: Record<string, unknown> = {};
  const entry = (key: FeedKey, chemical: string, value: unknown): Entry => {
    const h = hashOf(key, chemical);
    return h !== undefined
      ? { source: h.source, inputsHash: h.inputsHash, value: encodeJson(value) }
      : feedEntry(SOURCE[key] as keyof Screens, forms[key], encodeJson(value));
  };
  for (const key of PERSISTED) {
    const slots = FEEDS[key].slots();
    if (slots.size === 0) continue;
    if (!isChemicalFeed(key)) {
      feeds[key] = entry(key, '', slots.get(''));
      continue;
    }
    const out: Record<string, Entry> = {};
    for (const [chemical, value] of slots) out[chemical] = entry(key, chemical, value);
    feeds[key] = out;
  }
  return feeds as Feeds;
}

function build(): ReturnType<typeof buildProject> {
  return buildProject({
    screens: scrubRejected(screens),
    feeds: currentFeeds(),
    overrides,
    site,
    chemicals,
    modeledLevels,
    createdWith: APP_VERSION,
    ...(title !== '' ? { title } : {}),
  });
}

/** The live project as the file and the autosave hold it. */
export const currentProject = build;

function snapshot(): string {
  return stableStringify({
    screens,
    title,
    feeds: currentFeeds(),
    overrides,
    site,
    chemicals,
    modeledLevels,
  });
}

const startSnapshot = (): string =>
  stableStringify({
    screens: defaultScreens(),
    title: '',
    feeds: {},
    overrides: emptyOverrides(),
    site: defaultSite(),
    chemicals: [],
    modeledLevels: {},
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

export const getModeledLevels = (): Readonly<Record<string, SavedModeledLevels>> => modeledLevels;
/**
 * Keep the levels the cleanup screen just solved for one chemical. The same levels again change nothing
 * (no save, no unsaved-change mark); subscribers are told otherwise.
 */
export function setModeledLevels(entry: SavedModeledLevels): void {
  const held = modeledLevels[entry.chemicalId];
  if (held !== undefined && stableStringify(held) === stableStringify(entry)) return;
  modeledLevels = { ...modeledLevels, [entry.chemicalId]: entry };
  schedule();
  notify();
}
/** Forget the levels kept for one chemical (it left the project). */
export function clearModeledLevels(chemicalId: string): void {
  if (!(chemicalId in modeledLevels)) return;
  const { [chemicalId]: _gone, ...rest } = modeledLevels;
  void _gone;
  modeledLevels = rest;
  schedule();
  notify();
}

const chemicalListeners = new Set<() => void>();

/** The project chemical list. The array keeps its identity until the list changes (a snapshot for `useSyncExternalStore`). */
export const getChemicals = (): readonly ProjectChemical[] => chemicals;
/** Tell `fn` when the project chemical list changes; returns the unsubscribe. */
export const subscribeChemicals = (fn: () => void): (() => void) => {
  chemicalListeners.add(fn);
  return () => {
    chemicalListeners.delete(fn);
  };
};
function changeChemicals(next: ProjectChemical[]): void {
  chemicals = next;
  schedule();
  notify();
  chemicalListeners.forEach((fn) => fn());
}
/** Add an entry; a blank id or an id already in the list is ignored. */
export function addChemical(entry: ProjectChemical): void {
  const id = entry.id.trim();
  if (id === '' || chemicals.some((c) => c.id === id)) return;
  changeChemicals([
    ...chemicals,
    { ...entry, id, name: entry.name.trim() === '' ? id : entry.name },
  ]);
}
/**
 * Replace the entry that has this entry's id (a user chemical edited); an id not in the list is ignored.
 * A new name reaches the risk and cleanup rows and the typed name on the household and plants and eco
 * screens that hold this chemical, so every table, chart and the report shows it.
 */
export function updateChemical(entry: ProjectChemical): void {
  const old = chemicals.find((c) => c.id === entry.id);
  if (old === undefined) return;
  const name = entry.name.trim() === '' ? entry.id : entry.name;
  if (name !== old.name) renameInScreens(entry.id, name);
  changeChemicals(chemicals.map((c) => (c.id === entry.id ? { ...entry, name } : c)));
}

function renameInScreens(id: string, name: string): void {
  const rename = <T extends { id: string; name: string }>(rows: T[]): T[] =>
    rows.map((r) => (r.id === id ? { ...r, name } : r));
  const risk = getScreen('risk');
  if (risk.form.chemicals.some((c) => c.id === id)) {
    setScreen('risk', { ...risk, form: { ...risk.form, chemicals: rename(risk.form.chemicals) } });
  }
  const cleanup = getScreen('cleanup');
  if (cleanup.form.chemicals.some((c) => c.id === id)) {
    setScreen('cleanup', {
      ...cleanup,
      form: { ...cleanup.form, chemicals: rename(cleanup.form.chemicals) },
    });
  }
  const household = getScreen('household');
  if (household.form.chemicalId === id) {
    setScreen('household', { ...household, form: { ...household.form, chemicalName: name } });
  }
  const plantsEco = getScreen('plantsEco');
  if (plantsEco.form.chemicalId === id) {
    setScreen('plantsEco', { ...plantsEco, form: { ...plantsEco.form, chemicalName: name } });
  }
}
/** Remove the entry with this id; an id not in the list is ignored. Screens that name it keep their choice. */
export function removeChemical(id: string): void {
  if (!chemicals.some((c) => c.id === id)) return;
  changeChemicals(chemicals.filter((c) => c.id !== id));
}

/** The feeds that hold a slot sent for this chemical, in feed order (what removing it from the project clears). */
export function getHeldSlots(chemicalId: string): StaleFeedKey[] {
  if (chemicalId.trim() === '') return [];
  return STALE_KEYS.filter((k) => k !== 'tph' && FEEDS[k].slots().has(chemicalId));
}

/**
 * Take a chemical out of the whole project: the list, its row on the risk and cleanup screens (with the
 * state in it) and every feed slot sent for it. The other chemicals are untouched. A fate screen set
 * to it keeps its choice (it then shows as no longer in the list).
 */
export function removeProjectChemical(id: string): void {
  const risk = getScreen('risk');
  if (risk.form.chemicals.some((c) => c.id === id)) {
    setScreen('risk', {
      ...risk,
      form: { ...risk.form, chemicals: risk.form.chemicals.filter((c) => c.id !== id) },
    });
  }
  const cleanup = getScreen('cleanup');
  if (cleanup.form.chemicals.some((c) => c.id === id)) {
    setScreen('cleanup', {
      ...cleanup,
      form: { ...cleanup.form, chemicals: cleanup.form.chemicals.filter((c) => c.id !== id) },
    });
  }
  clearChemicalSlots(id);
  clearModeledLevels(id);
  if (USER_ID.test(id)) clearUserIdState(id);
  removeChemical(id);
}

const USER_ID = /^user-(\d+)$/;
/** The highest `user-<n>` number removed in this session, so a removed id is not handed out again. */
let retiredUserMax = 0;

/**
 * The next free `user-<n>` id: above every id on the list, every id a screen, the overrides or an
 * uncertainty choice still holds (an older file may), and every id removed this session.
 */
export function nextProjectUserId(): string {
  let max = retiredUserMax;
  const see = (text: string): void => {
    for (const m of text.matchAll(/user-(\d+)/g)) max = Math.max(max, Number(m[1]));
  };
  for (const c of chemicals) see(c.id);
  for (const id of chemicalIdsOf(screens)) see(id);
  for (const id of Object.keys(overrides.toxicity)) see(id);
  for (const t of screens.cleanup.form.surfaceTargets) see(t.chemicalId);
  for (const k of ['risk', 'cleanup', 'modeled'] as const) see(screens.uncertainty[k].choice);
  return `user-${max + 1}`;
}

/** Drop the per-id state a removed user chemical left: targets, overrides, uncertainty choice, fate pointers. */
function clearUserIdState(id: string): void {
  retiredUserMax = Math.max(retiredUserMax, Number(USER_ID.exec(id)?.[1] ?? 0));
  const cleanup = getScreen('cleanup');
  if (cleanup.form.surfaceTargets.some((t) => t.chemicalId === id)) {
    setScreen('cleanup', {
      ...cleanup,
      form: {
        ...cleanup.form,
        surfaceTargets: cleanup.form.surfaceTargets.filter((t) => t.chemicalId !== id),
      },
    });
  }
  if (id in overrides.toxicity) {
    const rest = { ...overrides.toxicity };
    delete rest[id];
    setOverrides({ ...overrides, toxicity: rest });
  }
  const u = getScreen('uncertainty');
  const next = { ...u };
  for (const k of ['risk', 'cleanup', 'modeled'] as const) {
    if (u[k].choice.startsWith(`${id}|`)) next[k] = { ...u[k], choice: '' };
  }
  setScreen('uncertainty', next);
  for (const key of [
    'transport',
    'vadose',
    'saturated',
    'vapor',
    'surfaceWater',
    'household',
    'plantsEco',
  ] as const) {
    const s = getScreen(key);
    if (s.form.chemicalId === id) {
      setScreen(key, { ...s, form: { ...s.form, chemicalId: '' } } as never);
    }
  }
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
  if (autosaveBlocked) return;
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

/**
 * Record a screen's live state; unchanged state is ignored so a remount does not cause a write. A
 * chemical this screen names now that it did not name before joins the list when it is not in it,
 * whether or not another screen named it before the edit (so a chemical removed from the list comes
 * back when a screen is set to it afresh, but not when a screen that still names it is edited).
 */
export function setScreen<K extends keyof Screens>(key: K, value: Screens[K]): void {
  if (stableStringify(screens[key]) === stableStringify(value)) return;
  const before = new Set(chemicalIdsOf(screens, key));
  screens = { ...screens, [key]: value };
  const named = deriveChemicals(screens, key).filter(
    (c) => !before.has(c.id) && !chemicals.some((e) => e.id === c.id),
  );
  schedule();
  recomputeStale();
  if (named.length > 0) changeChemicals([...chemicals, ...named]);
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
    // the inputs recorded with a sent result describe it; they are not part of what it is
    key = hashInputs(withoutRunInputs(value));
  } catch {
    contentCounter += 1;
    key = `object-${contentCounter}`;
  }
  contentKeys.set(value, key);
  return key;
}

/**
 * The fingerprint of the groundwater screen's form recorded when the run a cleanup consumer for
 * `chemicalId` reads was sent (the slot `feedSlots.resolveSlot` picks), or undefined when no run is held.
 * It belongs to that run alone: another chemical's send, or an edit of the screen, does not move it.
 */
export function getChainHash(chemicalId: string): string | undefined {
  const key = resolveSlot([...FEEDS.transportChain.slots().keys()], chemicalId);
  return key === null ? undefined : hashOf('transportChain', key)?.inputsHash;
}

/** The slot a consumer for `chemical` reads from feed `key` (see `feedSlots.pickSlot`). */
const read = (key: StaleFeedKey, chemical: string): unknown =>
  pickSlot(FEEDS[key].slots(), chemical);

/**
 * The chemical a feed's source screen sends for now, as a slot key: the screen's chemical (a linked
 * surface water run takes the chemical of the bank run it reads). The TPH feed has one slot.
 */
function activeChemical(key: StaleFeedKey): string {
  const s = screens;
  if (key === 'tph') return '';
  switch (SOURCE[key]) {
    case 'transport':
      return slotOf(s.transport.form.chemicalId);
    case 'vadose':
      return slotOf(s.vadose.form.chemicalId);
    case 'saturated':
      return slotOf(s.saturated.form.chemicalId);
    case 'vapor':
      return slotOf(s.vapor.form.chemicalId);
    case 'household':
      return slotOf(s.household.form.chemicalId);
    case 'plantsEco':
      return slotOf(s.plantsEco.form.chemicalId);
    case 'surfaceWater': {
      const f = s.surfaceWater.form;
      if (!f.linked) return slotOf(f.chemicalId);
      return slotOfValue(read('bank', slotOf(f.chemicalId)));
    }
    default:
      return '';
  }
}

/**
 * Inputs a sent slot was built from that are not in its source form: a setting kept beside the form
 * (the well method, the outdoor box, the source choice) and the feeds the sending screen reads from
 * other screens, each read for the slot's chemical. A change here makes the slot stale just as a form
 * edit does. Only the ones the sending screen really reads are listed, so an unrelated edit does not
 * mark a feed.
 */
function heldInputs(key: StaleFeedKey, chemical: string): unknown {
  const { transport, surfaceWater, saturated, vapor, household } = screens;
  const received = (): unknown => {
    // the transport screen reads the saturated source when it is on and held, and the vadose one
    // only when it is not
    const sat = read('saturated', chemical);
    const satOn = transport.form.feedFromSaturated && sat !== null;
    return {
      vadose: transport.form.feedFromVadose && !satOn ? contentKey(read('vadose', chemical)) : null,
      saturated: transport.form.feedFromSaturated ? contentKey(sat) : null,
    };
  };
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
      return {
        bank: surfaceWater.form.linked
          ? contentKey(read('bank', slotOf(surfaceWater.form.chemicalId)))
          : null,
      };
    case 'vaporRisk': {
      const series =
        vapor.choice === 'waterTable'
          ? read('vaporWaterTable', chemical)
          : vapor.choice === 'vadose'
            ? read('vaporVadose', chemical)
            : vapor.choice === 'saturated'
              ? read('vaporSaturated', chemical)
              : null;
      return { outdoor: vapor.outdoor, choice: vapor.choice, series: contentKey(series) };
    }
    case 'household': {
      const f = household.form;
      const usesWell = f.showerWaterSource === 'well' || f.irrigationWaterSource === 'well';
      return {
        well: usesWell ? contentKey(read('well', chemical)) : null,
        surface:
          f.irrigationWaterSource === 'surface' ? contentKey(read('surfaceWater', chemical)) : null,
      };
    }
    default:
      return null;
  }
}
const heldKey = (key: StaleFeedKey, chemical: string): string =>
  stableStringify(heldInputs(key, chemical));

const wasStale = (key: StaleFeedKey, chemical: string): boolean =>
  stale.some((s) => s.feed === key && s.chemicalId === chemical);

/** True while the sending inputs of the held slot differ from those recorded at send. */
function isStaleNow(
  key: StaleFeedKey,
  chemical: string,
  forms: Record<StaleFeedKey, unknown>,
): boolean {
  const h = hashOf(key, chemical);
  if (h === undefined) return false;
  // the screen is on another chemical: its inputs are not this slot's, so the slot keeps its mark
  if (chemical !== activeChemical(key)) return wasStale(key, chemical);
  if (h.inputsHash !== feedEntry(SOURCE[key] as keyof Screens, forms[key], 0).inputsHash) {
    return true;
  }
  const base = heldBaseline[key]?.[chemical];
  return base !== undefined && base !== heldKey(key, chemical);
}

/** Work the stale list out again; tell subscribers only when the set changed. */
function recomputeStale(): void {
  if (seeding) return;
  const forms = sourceForms(screens);
  const next: StaleSlot[] = [];
  for (const key of STALE_KEYS) {
    for (const chemical of FEEDS[key].slots().keys()) {
      if (isStaleNow(key, chemical, forms)) next.push({ feed: key, chemicalId: chemical });
    }
  }
  const same =
    next.length === stale.length &&
    next.every((s, i) => s.feed === stale[i]!.feed && s.chemicalId === stale[i]!.chemicalId);
  if (same) return;
  stale = next;
  const keys = [...new Set(next.map((s) => s.feed))];
  if (keys.length !== staleKeys.length || keys.some((k, i) => k !== staleKeys[i])) {
    staleKeys = keys;
  }
  staleListeners.forEach((fn) => fn());
}

function recordHash(key: StaleFeedKey, chemical: string): void {
  const held = FEEDS[key].slots().has(chemical);
  if (!held) {
    if (hashes[key]) delete hashes[key][chemical];
    if (heldBaseline[key]) delete heldBaseline[key][chemical];
  } else {
    hashes[key] = {
      ...hashes[key],
      [chemical]: {
        source: SOURCE[key],
        inputsHash: feedEntry(SOURCE[key] as keyof Screens, sourceForms(screens)[key], 0)
          .inputsHash,
      },
    };
    heldBaseline[key] = { ...heldBaseline[key], [chemical]: heldKey(key, chemical) };
  }
  if (PERSISTED.includes(key as FeedKey)) schedule();
}

/** The slots each feed held when last seen, so a change tells which slots were sent or cleared. */
const seen: Partial<Record<StaleFeedKey, FeedSlots<unknown>>> = {};
function onFeedChange(key: StaleFeedKey, slot?: string): void {
  const before = seen[key] ?? new Map<string, unknown>();
  const now = FEEDS[key].slots();
  seen[key] = now;
  // the slot a send wrote counts even when the same value was sent again (a re-send clears the mark);
  // every change of the single TPH feed is a send or a clear of its one slot
  const changed = new Set<string>(slot !== undefined ? [slot] : key === 'tph' ? [''] : []);
  for (const [chemical, v] of now) if (before.get(chemical) !== v) changed.add(chemical);
  for (const chemical of before.keys()) if (!now.has(chemical)) changed.add(chemical);
  for (const chemical of changed) recordHash(key, chemical);
  recomputeStale();
}

let watching = false;
function watchFeeds(): void {
  if (watching) return;
  watching = true;
  for (const key of STALE_KEYS) FEEDS[key].subscribe((slot) => onFeedChange(key, slot));
}
watchFeeds();

function clearAllFeeds(): void {
  for (const key of STALE_KEYS) FEEDS[key].clear();
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
  chemicals = [];
  modeledLevels = {};
  hashes = {};
  heldBaseline = {};
  stale = [];
  staleKeys = [];
  dropped = [];
  savedSnapshot = null;
  warnedSnapshot = null;
  autosaveBlocked = false;
}

/**
 * Read the autosave and seed the screens and feeds from it. Called once before the first render. A
 * missing, unreadable, corrupt, foreign or newer save leaves today's behaviour (a fresh project).
 */
export function hydrate(): void {
  let text: string | null;
  try {
    text = localStorage.getItem(AUTOSAVE_KEY);
    if (text === null) text = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    return;
  }
  if (text === null) return;
  autosaveBlocked = isTooNew(text);
  const r = parseProject(text);
  if (!r.ok) return;
  seed(r.project, r.droppedFeeds ?? []);
  notify();
  chemicalListeners.forEach((fn) => fn());
}

/**
 * Put a parsed project into the screens and feeds. The screens always seed; a feed slot that cannot
 * be put back is dropped on its own (and its feed listed) without touching the others.
 */
function seed(project: Project, droppedKeys: readonly string[] = []): void {
  screens = screensOf(project);
  overrides = overridesOf(project);
  site = siteOf(project);
  chemicals = chemicalsOf(project);
  modeledLevels = modeledLevelsOf(project);
  title = project.title ?? '';
  dropped = [...droppedKeys];
  const feeds = (project.feeds ?? {}) as Record<string, unknown>;
  const restored: Partial<Record<StaleFeedKey, Record<string, Hash>>> = {};
  seeding = true;
  try {
    for (const key of PERSISTED) {
      const stored = feeds[key];
      if (stored === undefined || stored === null) continue;
      const entries: [string, Entry][] = isChemicalFeed(key)
        ? Object.entries(stored as Record<string, Entry>)
        : [['', stored as Entry]];
      for (const [, e] of entries) {
        try {
          const value = decodeJson(e.value);
          FEEDS[key].set(value as never);
          const chemical = isChemicalFeed(key) ? slotOfValue(value) : '';
          restored[key] = {
            ...restored[key],
            [chemical]: { source: e.source, inputsHash: e.inputsHash },
          };
        } catch {
          if (!dropped.includes(key)) dropped.push(key);
        }
      }
    }
    // the setters above recorded fresh hashes; put back the ones the file carried
    hashes = restored;
    // a file records only the source form of each slot, so what else a slot read (held feeds, the
    // well method) is taken as it is now: an opened file reports exactly the form changes it always
    // did, and an edit after the open is what the live mark follows
    heldBaseline = {};
    for (const key of Object.keys(restored) as StaleFeedKey[]) {
      const base: Record<string, string> = {};
      for (const chemical of Object.keys(restored[key] ?? {})) {
        base[chemical] = heldKey(key, chemical);
      }
      heldBaseline[key] = base;
    }
  } finally {
    seeding = false;
  }
  stale = [];
  staleKeys = [];
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
  chemicalListeners.forEach((fn) => fn());
}

/** Clear the forms, the feeds and the autosave. Mounted screens remount through the epoch. */
export function newProject(): void {
  retiredUserMax = 0;
  screens = defaultScreens();
  title = '';
  overrides = emptyOverrides();
  site = defaultSite();
  chemicals = [];
  modeledLevels = {};
  clearAllFeeds();
  hashes = {};
  heldBaseline = {};
  dropped = [];
  recomputeStale();
  if (timer !== null) clearTimeout(timer);
  timer = null;
  try {
    if (!autosaveBlocked) localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // nothing stored, or storage blocked
  }
  markSaved();
  epoch += 1;
  notify();
  chemicalListeners.forEach((fn) => fn());
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
