import { slotOf } from './feedSlots';
import { cloneData } from './merge';

/** The project format version this build writes and reads. */
export const CURRENT_VERSION = 2;

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The screen each chemical-scoped feed is sent from, whose `chemicalId` tells the chemical of a feed
 * sent before the tag existed. Kept here (not imported from the schema) so the step stays as it was
 * written when later versions change the schema.
 */
const V1_SOURCE_SCREEN: Readonly<Record<string, string>> = {
  well: 'transport',
  bank: 'transport',
  vaporWaterTable: 'transport',
  surfaceWater: 'surfaceWater',
  vadose: 'vadose',
  vaporVadose: 'vadose',
  saturated: 'saturated',
  vaporSaturated: 'saturated',
  vaporRisk: 'vapor',
  household: 'household',
  produce: 'plantsEco',
};
/** Screen fixtures that are not a chemical (the vapor screen's Table R-3 test values). */
const NOT_A_CHEMICAL: readonly string[] = ['risc4-benzene'];

/**
 * Version 1 to 2: each feed about one chemical becomes an object of one slot, keyed by the chemical
 * the value was made for. A tagged value keeps its tag. An untagged one (sent before wave N) takes
 * the chemical of its source screen's `chemicalId`, and a linked surface water run with none set takes
 * its bank run's chemical; the value is tagged with it, so every consumer accepts it for that chemical.
 * When that cannot be told (the screen typed by hand) the feed is left out, and `parseProject` reports
 * it as dropped. An entry that is not a feed at all is kept in the untagged slot, where the usual
 * check drops and reports it. The TPH feed and any unknown key pass through unchanged.
 */
export function v1ToV2(doc: Obj): Obj {
  const out: Obj = { ...doc, version: 2 };
  const feeds = doc['feeds'];
  if (!isObj(feeds)) return out;
  const screens = isObj(doc['screens']) ? doc['screens'] : {};
  const screenChemical = (screen: string): string => {
    const s = screens[screen];
    const form = isObj(s) ? s['form'] : undefined;
    const id = isObj(form) ? form['chemicalId'] : undefined;
    const key = slotOf(typeof id === 'string' ? id : undefined);
    return NOT_A_CHEMICAL.includes(key) ? '' : key;
  };
  const linked = (): boolean => {
    const s = screens['surfaceWater'];
    const form = isObj(s) ? s['form'] : undefined;
    return isObj(form) && form['linked'] === true;
  };
  const chemicalOf: Record<string, string> = {};
  const next: Obj = {};
  // the bank run first: a linked surface water run takes its chemical
  const keys = Object.keys(feeds).sort((a, b) => Number(b === 'bank') - Number(a === 'bank'));
  for (const key of keys) {
    const entry = feeds[key];
    const source = V1_SOURCE_SCREEN[key];
    if (source === undefined) {
      next[key] = entry;
      continue;
    }
    const value = isObj(entry) ? entry['value'] : undefined;
    if (!isObj(entry) || !isObj(value)) {
      next[key] = { '': entry };
      continue;
    }
    const tag = value['chemicalId'];
    let chemical = slotOf(typeof tag === 'string' ? tag : undefined);
    if (chemical === '') chemical = screenChemical(source);
    if (chemical === '' && key === 'surfaceWater' && linked()) chemical = chemicalOf['bank'] ?? '';
    if (chemical === '') continue;
    chemicalOf[key] = chemical;
    next[key] = { [chemical]: { ...entry, value: { ...value, chemicalId: chemical } } };
  }
  // keep the file's key order
  const ordered: Obj = {};
  for (const key of Object.keys(feeds)) if (key in next) ordered[key] = next[key];
  out['feeds'] = ordered;
  return out;
}

/**
 * `migrations[n]` turns a version n document into a version n + 1 document. Pure functions, applied
 * in order on load. A form field rename, a unit change or a change of a stored shape adds an entry and
 * bumps CURRENT_VERSION; adding an optional field does not. Each entry needs a fixture test (a saved
 * version n file that loads to the expected version n + 1 document; see `migrateV2.test.ts`).
 */
export const migrations: Record<number, Migration> = { 1: v1ToV2 };

/** Apply the steps from the document's own version up to `target`, on a copy. */
export function migrate(
  doc: Record<string, unknown>,
  target: number,
  table: Record<number, Migration> = migrations,
): Record<string, unknown> {
  let current = cloneData(doc);
  let version = Number(current['version']);
  while (version < target) {
    const step = table[version];
    if (!step) throw new Error(`no migration from version ${version}`);
    current = step(current);
    version += 1;
  }
  return current;
}
