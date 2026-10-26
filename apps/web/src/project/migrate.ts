import { slotOf } from './feedSlots';
import { cloneData } from './merge';

/** The project format version this build writes and reads. */
export const CURRENT_VERSION = 3;

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
 * Version 2 to 3: adds the `guided` key (the guided flow's answers) from what the screens already hold,
 * and changes nothing else, so an old project's screens, feeds, overrides, site and modeled levels stay
 * as they were. Pure, and written out in full here (it does not import the guided schema, as `v1ToV2`
 * keeps its own tables). The sent results are not carried over: the guided outputs start empty and the
 * workbench report prints the feeds as before.
 *
 * - `site`: receptors as is; `direct` becomes `measured` with the direct media; `modeled` maps `soil` to
 *   `soilAbove` with the leaching and well paths, `groundwater` to itself with the well path,
 *   `soilToIndoorAir` to `soilAbove` with the building path, `soilGasToIndoorAir` to `soilGas` with the
 *   building path; location as is; `vaporMethod` becomes `indoorModel`; the two produce flags become
 *   `produce` (both, which was refused, reads as soil). A file with no `site` keeps the guided defaults.
 * - `forms.<model>`: the stored screen form without its chemical fields and source concentrations.
 * - `sources`: each fate form's source value for that form's chemical (the first screen to give one for a
 *   medium wins), and for a measured basis the risk rows' concentrations instead.
 * - `exposure` from the risk form's receptors and `targets` from the cleanup form's allocation, risk and
 *   hazard targets and well target; the receptor edits `risk.a` and `risk.b` are copied to `guided.a`
 *   and `guided.b`.
 */
const V3_STRIPPED: Readonly<Record<string, readonly string[]>> = {
  transport: ['chemicalId', 'halfLifeYr', 'kd', 'c0'],
  vadose: ['chemicalId', 'M', 'S', 'H', 'Koc', 'Da', 'Dw', 'mu', 'srcF'],
  saturated: ['chemicalId', 'M', 'S', 'H', 'Koc', 'F'],
  vapor: [
    'chemicalId',
    'M',
    'S',
    'H',
    'Koc',
    'Da',
    'Dw',
    'TB',
    'TC',
    'dHvb',
    'soilConc',
    'soilGas',
    'cgw',
  ],
  surfaceWater: ['chemicalId', 'koc', 'kd', 'solubility', 'groundwaterConcentration'],
  household: [
    'chemicalId',
    'chemicalName',
    'henry',
    'molecularWeight',
    'henryAtm',
    'vaporPressure',
    'waterConcentration',
    'soilConcentration',
  ],
  plantsEco: [
    'chemicalId',
    'chemicalName',
    'logKow',
    'koc',
    'kd',
    'userBcf',
    'tscf',
    'ionizable',
    'inorganic',
    'soilConcentration',
  ],
};
const V3_MEASURED: Readonly<Record<string, [string, string]>> = {
  soil: ['soil', 'mg/kg'],
  groundwater: ['groundwater', 'mg/L'],
  surfaceWater: ['surfaceWater', 'mg/L'],
  indoorAir: ['indoorAir', 'mg/m3'],
  outdoorAir: ['outdoorAir', 'mg/m3'],
};

export function v2ToV3(doc: Obj): Obj {
  const out: Obj = { ...doc, version: 3 };
  const guided: Obj = {};
  const screens = isObj(doc['screens']) ? doc['screens'] : {};
  const formOf = (screen: string): Obj | undefined => {
    const s = screens[screen];
    const f = isObj(s) ? s['form'] : undefined;
    return isObj(f) ? f : undefined;
  };
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  // site
  const site = doc['site'];
  let measuredBasis = false;
  if (isObj(site)) {
    const media = Array.isArray(site['media'])
      ? site['media'].filter((m) => typeof m === 'string')
      : [];
    measuredBasis = site['basis'] === 'direct';
    const sources: string[] = [];
    const measured: string[] = [];
    const paths = { leaching: false, well: false, building: false, stream: false };
    const add = (s: string): void => {
      if (!sources.includes(s)) sources.push(s);
    };
    for (const m of media as string[]) {
      if (measuredBasis) {
        if (m in V3_MEASURED) measured.push(m);
      } else if (m === 'soil') {
        add('soilAbove');
        paths.leaching = true;
        paths.well = true;
      } else if (m === 'groundwater') {
        add('groundwater');
        paths.well = true;
      } else if (m === 'soilToIndoorAir') {
        add('soilAbove');
        paths.building = true;
      } else if (m === 'soilGasToIndoorAir') {
        add('soilGas');
        paths.building = true;
      }
    }
    const g: Obj = {};
    if (site['receptors'] !== undefined) g['receptors'] = site['receptors'];
    g['basis'] = measuredBasis ? 'measured' : 'modeled';
    g['sources'] = sources;
    g['measured'] = measured;
    if (site['location'] !== undefined) g['location'] = site['location'];
    g['paths'] = paths;
    if (site['vaporMethod'] !== undefined) g['indoorModel'] = site['vaporMethod'];
    g['produce'] =
      site['produceSoil'] === true
        ? 'soil'
        : site['produceIrrigation'] === true
          ? 'irrigation'
          : 'none';
    guided['site'] = g;
  }

  // templates
  const forms: Obj = {};
  for (const [screen, stripped] of Object.entries(V3_STRIPPED)) {
    const form = formOf(screen);
    if (form === undefined) continue;
    const t: Obj = {};
    for (const [k, v] of Object.entries(form)) if (!stripped.includes(k)) t[k] = cloneData(v);
    // the guided transport template takes its retardation from each chemical's Kd, as a blank one does
    if (screen === 'transport' && 'retardMode' in t) t['retardMode'] = 'kd';
    forms[screen] = t;
  }
  if (Object.keys(forms).length > 0) guided['forms'] = forms;

  // sources
  const sources: Record<string, { values: Obj; note: string; tph: string }> = {};
  const put = (chemical: string, medium: string, value: unknown, unit: string): void => {
    const v = str(value);
    if (chemical === '' || v === '') return;
    const entry = (sources[chemical] ??= { values: {}, note: '', tph: '' });
    if (!(medium in entry.values)) entry.values[medium] = { value: v, unit };
  };
  if (!measuredBasis) {
    const idOf = (f: Obj): string => str(f['chemicalId']);
    const transport = formOf('transport');
    if (transport && transport['sourceMode'] !== 'massRate')
      put(idOf(transport), 'groundwater', transport['c0'], 'mg/L');
    const vadose = formOf('vadose');
    if (vadose) put(idOf(vadose), 'soilAbove', vadose['srcF'], 'mg/kg');
    const saturated = formOf('saturated');
    if (saturated) put(idOf(saturated), 'soilBelow', saturated['F'], 'mg/kg');
    const vapor = formOf('vapor');
    if (vapor && idOf(vapor) !== 'risc4-benzene') {
      if (vapor['source'] === 'soil') put(idOf(vapor), 'soilAbove', vapor['soilConc'], 'mg/kg');
      else if (vapor['source'] === 'soilGas')
        put(idOf(vapor), 'soilGas', vapor['soilGas'], 'mg/m3');
      else if (vapor['source'] === 'groundwater')
        put(idOf(vapor), 'groundwater', vapor['cgw'], 'mg/L');
    }
    const sw = formOf('surfaceWater');
    if (sw) put(idOf(sw), 'groundwater', sw['groundwaterConcentration'], 'mg/L');
    const household = formOf('household');
    if (household) {
      put(idOf(household), 'groundwater', household['waterConcentration'], 'mg/L');
      put(idOf(household), 'soilAbove', household['soilConcentration'], 'mg/kg');
    }
    const plants = formOf('plantsEco');
    if (plants) put(idOf(plants), 'soilAbove', plants['soilConcentration'], 'mg/kg');
  } else {
    const risk = formOf('risk');
    const rows = risk && Array.isArray(risk['chemicals']) ? risk['chemicals'] : [];
    for (const row of rows) {
      if (!isObj(row) || !isObj(row['conc'])) continue;
      const id = str(row['id']);
      for (const [medium, [key, unit]] of Object.entries(V3_MEASURED))
        put(id, key, row['conc'][medium], unit);
    }
  }
  if (Object.keys(sources).length > 0) guided['sources'] = sources;

  // exposure
  const risk = formOf('risk');
  if (risk) {
    const e: Obj = {};
    if (isObj(risk['a'])) {
      e['a'] = cloneData(risk['a']);
      if (isObj(risk['a']['pathways'])) e['pathways'] = cloneData(risk['a']['pathways']);
    }
    if (risk['b'] === null || isObj(risk['b'])) e['b'] = cloneData(risk['b']);
    if (typeof risk['additive'] === 'boolean') e['additive'] = risk['additive'];
    if (Object.keys(e).length > 0) guided['exposure'] = e;
  }

  // targets
  const cleanup = formOf('cleanup');
  if (cleanup) {
    const t: Obj = {};
    for (const k of ['allocation', 'targetRisk', 'targetHq'])
      if (typeof cleanup[k] === 'string') t[k] = cleanup[k];
    const well = str(cleanup['wellTarget']);
    const rows = Array.isArray(cleanup['chemicals']) ? cleanup['chemicals'] : [];
    // the well target only counts when the screen applied it (target kind 'well')
    if (well !== '' && cleanup['targetKind'] === 'well') {
      const standards: Obj = {};
      for (const row of rows) {
        const id = isObj(row) ? str(row['id']) : '';
        if (id !== '')
          standards[id] = {
            kind: 'state',
            value: well,
            unit: 'mg/L',
            source: 'Cleanup levels screen, well target',
          };
      }
      if (Object.keys(standards).length > 0) t['standards'] = standards;
    }
    if (Object.keys(t).length > 0) guided['targets'] = t;
  }

  // receptor edits
  const ov = doc['overrides'];
  if (isObj(ov)) {
    const copy = (field: string): void => {
      const set = ov[field];
      if (!isObj(set)) return;
      const next: Obj = { ...set };
      for (const w of ['a', 'b'])
        if (`risk.${w}` in set) next[`guided.${w}`] = cloneData(set[`risk.${w}`]);
      (out['overrides'] as Obj)[field] = next;
    };
    out['overrides'] = { ...ov };
    copy('receptors');
    copy('receptorNames');
  }

  out['guided'] = guided;
  return out;
}

/**
 * `migrations[n]` turns a version n document into a version n + 1 document. Pure functions, applied
 * in order on load. A form field rename, a unit change or a change of a stored shape adds an entry and
 * bumps CURRENT_VERSION; adding an optional field does not. Each entry needs a fixture test (a saved
 * version n file that loads to the expected version n + 1 document; see `migrateV2.test.ts`).
 */
export const migrations: Record<number, Migration> = { 1: v1ToV2, 2: v2ToV3 };

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
