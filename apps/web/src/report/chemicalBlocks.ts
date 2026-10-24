import { convert, registry, type EpcSpec } from '@model-flow/engine';
import type { CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { FeedSlots } from '../project/feedSlots';
import { compute as computeVadose } from '../vadose/compute';
import { vadoseCsvTables } from '../vadose/csv';
import type { VadoseFeed } from '../vadose/feed';
import { compute as computeSaturated } from '../saturated/compute';
import { saturatedCsvTables } from '../saturated/csv';
import type { SaturatedFeed } from '../saturated/feed';
import type { WellFeed } from '../transport/wellFeed';
import type { BankFeed } from '../transport/bankFeed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import type { ScreenKey } from './methodsRun';

/**
 * One chemical's block in the report section of a fate screen. A fate screen runs one chemical at a time,
 * so the screen's own results are about the chemical last run; the results that were sent on for the other
 * chemicals (the per-chemical feed slots of a project) are what the risk and cleanup screens used, and the
 * report prints each, named by the chemical's name, with the inputs it ran with.
 */

export interface ChemicalBlock {
  /** The slot key: the chemical's id, or '' for a run made with the chemical typed by hand. */
  chemicalId: string;
  /** The chemical's name; never its id or CAS number. */
  name: string;
  /** What was sent and to whom, one line per sent result. */
  sent: string[];
  /** The inputs the sent result ran with. */
  inputs: { label: string; value: string }[];
  /** Why part of the block is missing, when it is. */
  notes: string[];
  tables: CsvTable[];
}

/** The run a fate screen currently shows, and whether it was sent on. */
export interface CurrentRun {
  chemical: string;
  /** Where a result of exactly this run went, or null when none did. */
  sentTo: string | null;
  /**
   * Where a result of an earlier run of this chemical went, when the screen's inputs have changed since
   * it was sent: the block above is that sent run, and this section's tables are not. Absent when no sent
   * result is out of step with the screen.
   */
  changedSince?: string;
}

/** The held feed slots a section reads, by feed key. */
export type Slots = <T>(key: string) => FeedSlots<T>;

/** The chemical name of a slot key. */
export type NameOf = (chemicalId: string) => string;

const YR = convert(1, 'yr', 's');
const sig = (x: number): number => Number(x.toPrecision(6));

const HAND = 'Chemical entered by hand (not from the database)';

/** The name of a method id as the methods statement prints it, or the plain words for an entered value. */
export function methodName(id: string | undefined): string {
  if (id === undefined || id === '' || id === 'entered') return 'entered by the user';
  return registry.has(id) ? registry.get(id).name : 'a method of this program';
}

/** The slot keys of several feeds of one screen, in the order first seen. */
function chemicalsOf(slots: ReadonlyMap<string, unknown>[]): string[] {
  return [...new Set(slots.flatMap((m) => [...m.keys()]))];
}

const nameFor = (id: string, nameOf: NameOf): string => (id === '' ? HAND : nameOf(id));

function table(
  name: string,
  label: string,
  columns: CsvTable['columns'],
  rows: CsvRow[],
): CsvTable {
  return { name, label, columns, rows };
}

const slug = (id: string): string => (id === '' ? 'hand' : id.replace(/[^A-Za-z0-9]+/g, '-'));

/* ------------------------------------------------------------------- series */

interface Series {
  times: readonly number[];
  values: readonly number[];
}

/** Peak, time of peak and last value of a concentration series (SI in; yr and the display unit out). */
function seriesSummary(series: Series, scale: number): { peak: number; at: number; last: number } {
  let at = 0;
  series.values.forEach((v, i) => {
    if (v > series.values[at]!) at = i;
  });
  return {
    peak: (series.values[at] ?? 0) * scale,
    at: convert(series.times[at] ?? 0, 's', 'yr'),
    last: (series.values[series.values.length - 1] ?? 0) * scale,
  };
}

function seriesTables(
  stem: string,
  label: string,
  id: string,
  series: Series,
  unit: string,
  scale: number,
  method: string,
): CsvTable[] {
  const s = seriesSummary(series, scale);
  return [
    table(
      `${stem}-summary-${slug(id)}`,
      `${label}, summary`,
      [
        { key: 'method', header: 'method' },
        { key: 'peak', header: 'peak concentration', unit },
        { key: 'at', header: 'time of the peak', unit: 'yr' },
        { key: 'last', header: 'concentration at the end', unit },
        { key: 'length', header: 'length of the series', unit: 'yr' },
      ],
      [
        {
          method,
          peak: s.peak,
          at: s.at,
          last: s.last,
          length: convert(series.times[series.times.length - 1] ?? 0, 's', 'yr'),
        },
      ],
    ),
    table(
      `${stem}-series-${slug(id)}`,
      label,
      [
        { key: 'time', header: 'time', unit: 'yr' },
        { key: 'concentration', header: 'concentration', unit },
      ],
      series.times.map((t, i) => ({
        time: convert(t, 's', 'yr'),
        concentration: (series.values[i] ?? 0) * scale,
      })),
    ),
  ];
}

/** kg/m3 to mg/L. */
const MG_PER_L = 1e3;
/** kg/m3 to mg/m3. */
const MG_PER_M3 = 1e6;

/* ---------------------------------------------------------------- transport */

const WELL_METHOD: Record<WellFeed['method'], string> = {
  legacy: 'groundwater.at123d',
  modern: 'groundwater.wexler1992',
  domenico: 'groundwater.domenico1987',
};

/** The aquifer, source and receptor a plume run carried, in the units the screen shows. */
function transportInputs(bank: BankFeed): { label: string; value: string }[] {
  const s = bank.scenario as unknown as Record<string, unknown>;
  const num = (k: string): number | null => (typeof s[k] === 'number' ? (s[k] as number) : null);
  const out: { label: string; value: string }[] = [];
  const add = (label: string, v: number | null, unit: string, scale = 1): void => {
    if (v !== null && Number.isFinite(v)) out.push({ label, value: `${sig(v * scale)} ${unit}` });
  };
  const velocity = num('velocity');
  add('Seepage velocity', velocity, 'm/yr', YR);
  add('Porosity', num('porosity'), '');
  add('Retardation factor', num('retardation'), '');
  const decay = num('decayRate');
  out.push({
    label: 'Decay half-life',
    value: decay === null || decay <= 0 ? 'none' : `${sig(Math.LN2 / decay / YR)} yr`,
  });
  add('Longitudinal dispersivity', num('alphaL'), 'm');
  add('Transverse dispersivity', num('alphaT'), 'm');
  add('Vertical dispersivity', num('alphaV'), 'm');
  add('Source length along flow', num('srcLength'), 'm');
  add('Source width across flow', num('srcWidth'), 'm');
  add('Source thickness', num('srcDepth'), 'm');
  const fed = s['fed'] as { label?: string } | undefined;
  if (fed !== undefined && fed !== null) {
    out.push({
      label: 'Source',
      value: `fed by another screen's result (${fed.label ?? 'a sent run'})`,
    });
  } else {
    add('Source concentration', num('c0'), 'mg/L', MG_PER_L);
    add('Source mass release rate', num('massRate'), 'g/d', 1000 * 86400);
  }
  const rx = s['receptor'] as { x?: number; y?: number } | undefined;
  if (rx?.x !== undefined) add('Receptor distance downgradient', rx.x, 'm');
  if (rx?.y !== undefined) add('Receptor distance across flow', rx.y, 'm');
  add('Evaluation time', num('time'), 'yr', 1 / YR);
  return out;
}

export function transportBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const well = slots<WellFeed>('well');
  const bank = slots<BankFeed>('bank');
  return chemicalsOf([well, bank]).map((id) => {
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [],
      inputs: [],
      notes: [],
      tables: [],
    };
    const w = well.get(id);
    if (w !== undefined) {
      block.sent.push(
        `Receptor well concentration sent to the exposure and risk screen: ${w.label}`,
      );
      block.inputs.push({ label: 'Method sent', value: methodName(WELL_METHOD[w.method]) });
      block.tables.push(
        ...seriesTables(
          'transport-well',
          'receptor well concentration',
          id,
          w,
          'mg/L',
          MG_PER_L,
          methodName(WELL_METHOD[w.method]),
        ),
      );
    } else {
      block.notes.push(
        'No well concentration was sent to the exposure and risk screen for this chemical.',
      );
    }
    const b = bank.get(id);
    if (b !== undefined) {
      block.sent.push(`Plume run sent to the surface water screen: ${b.label}`);
      block.inputs.push(...transportInputs(b));
    }
    return block;
  });
}

/* ------------------------------------------------------------------- vadose */

type Method = 'legacy' | 'modern';
const METHOD_WORDS: Record<Method, string> = { legacy: 'legacy method', modern: 'modern method' };

/**
 * The tables of a run repeated with both methods, split by method: the method that was sent first,
 * labelled as the one the groundwater screen used, then the other, labelled as a sensitivity that is not
 * the run the groundwater screen used (the way the rest of the report treats legacy against modern). A
 * method the repeat did not produce has no tables.
 */
function tablesBySentMethod<R extends { runs: Partial<Record<Method, unknown>> }>(
  result: R,
  sent: Method,
  build: (only: R) => CsvTable[],
  block: ChemicalBlock,
  id: string,
): CsvTable[] {
  const other: Method = sent === 'legacy' ? 'modern' : 'legacy';
  const out: CsvTable[] = [];
  for (const m of [sent, other]) {
    if (result.runs[m] === undefined) continue;
    const isSent = m === sent;
    const note = isSent
      ? `${METHOD_WORDS[m]}, the one the groundwater screen used`
      : `${METHOD_WORDS[m]}, a sensitivity: not the run the groundwater screen used`;
    out.push(
      ...build({ ...result, runs: { [m]: result.runs[m] } }).map((t) => ({
        ...t,
        name: `${t.name}-${slug(id)}-${isSent ? 'sent' : 'sensitivity'}`,
        label: `${t.label}, ${block.name}, ${note}`,
      })),
    );
  }
  if (result.runs[other] !== undefined) {
    block.notes.push(
      `The ${METHOD_WORDS[other]} is printed as a sensitivity and is not the run the groundwater screen used; the ${METHOD_WORDS[sent]} was sent.`,
    );
  }
  return out;
}

export function vadoseBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<VadoseFeed>('vadose');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Vadose leaching run sent to the groundwater screen as its source: ${f.label}`],
      inputs: [
        { label: 'Method sent', value: f.method === 'legacy' ? 'legacy method' : 'modern method' },
        { label: 'Run length', value: `${sig(f.scenario.duration / YR)} yr` },
        { label: 'Source length', value: `${sig(f.scenario.source.length)} m` },
        { label: 'Source width', value: `${sig(f.scenario.source.width)} m` },
        { label: 'Source thickness', value: `${sig(f.scenario.source.thickness)} m` },
        {
          label: 'Water table depth below the source',
          value: `${sig(f.scenario.waterTableDepth)} m`,
        },
      ],
      notes: [],
      tables: [],
    };
    const out = computeVadose({ scenario: f.scenario });
    if (!out.ok) block.notes.push(`The sent run could not be repeated: ${out.error}`);
    else {
      block.tables.push(...tablesBySentMethod(out.result, f.method, vadoseCsvTables, block, id));
    }
    return block;
  });
}

/* ---------------------------------------------------------------- saturated */

export function saturatedBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<SaturatedFeed>('saturated');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const i = f.input;
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Saturated source run sent to the groundwater screen as its source: ${f.label}`],
      inputs: [
        { label: 'Method sent', value: f.method === 'legacy' ? 'legacy method' : 'modern method' },
        { label: 'Horizon', value: `${sig(i.tEnd / YR)} yr` },
        { label: 'Source length along flow', value: `${sig(i.source.length)} m` },
        { label: 'Source width across flow', value: `${sig(i.source.width)} m` },
        { label: 'Source thickness', value: `${sig(i.source.thickness)} m` },
        {
          label: 'Aquifer conductivity',
          value: `${sig(convert(i.aquifer.conductivity, 'm/s', 'm/d'))} m/d`,
        },
        { label: 'Hydraulic gradient', value: `${sig(i.aquifer.gradient)} m/m` },
        {
          label: 'Infiltration',
          value: `${sig(convert(i.infiltration, 'm/s', 'm/yr') * 100)} cm/yr`,
        },
      ],
      notes: [],
      tables: [],
    };
    const out = computeSaturated({ scenario: { input: i } });
    if (!out.ok) block.notes.push(`The sent run could not be repeated: ${out.error}`);
    else {
      block.tables.push(...tablesBySentMethod(out.result, f.method, saturatedCsvTables, block, id));
    }
    return block;
  });
}

/* ----------------------------------------------------------------- air (EPC) */

const AIR_COLUMNS: CsvTable['columns'] = [
  { key: 'where', header: 'air' },
  { key: 'form', header: 'form' },
  { key: 'concentration', header: 'concentration, or peak of the series', unit: 'mg/m3' },
  { key: 'at', header: 'time of the peak', unit: 'yr' },
  { key: 'method', header: 'method' },
];

function airRow(where: string, epc: EpcSpec | undefined): CsvRow | null {
  if (epc === undefined) return null;
  if (epc.kind === 'constant') {
    return {
      where,
      form: 'constant',
      concentration: epc.value * MG_PER_M3,
      at: null,
      method: methodName(epc.origin),
    };
  }
  const s = seriesSummary(epc.series, MG_PER_M3);
  return {
    where,
    form: 'time series',
    concentration: s.peak,
    at: s.at,
    method: methodName(epc.origin),
  };
}

export function vaporBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<VaporRiskFeed>('vaporRisk');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const rows = [airRow('Indoor air', f.indoor), airRow('Outdoor air', f.outdoor)].filter(
      (r): r is CsvRow => r !== null,
    );
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Air concentrations sent to the exposure and risk screen: ${f.label}`],
      inputs: [],
      notes: [],
      tables: [],
    };
    if (rows.length === 0) block.notes.push('The sent result holds no air concentration.');
    else {
      block.tables.push(
        table(
          `vapor-air-${slug(id)}`,
          `air concentrations from the vapor run, ${block.name}`,
          AIR_COLUMNS,
          rows,
        ),
      );
    }
    return block;
  });
}

/* ---------------------------------------------------------- surface water */

const SURFACE_METHOD: Record<SurfaceWaterFeed['method'], string> = {
  'well-mixed': 'legacy well-mixed method',
  'mass-discharge': 'modern mass-discharge method',
};

export function surfaceWaterBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<SurfaceWaterFeed>('surfaceWater');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Surface water concentration sent to the exposure and risk screen: ${f.label}`],
      inputs: [{ label: 'Method sent', value: SURFACE_METHOD[f.method] }],
      notes: [],
      tables: [],
    };
    block.tables.push(
      ...seriesTables(
        'surface-water',
        'surface water concentration',
        id,
        f,
        'mg/L',
        MG_PER_L,
        SURFACE_METHOD[f.method],
      ),
    );
    if (f.coefficient?.value != null) {
      block.inputs.push({
        label: 'Peak surface water per unit of groundwater source',
        value: String(sig(f.coefficient.value)),
      });
    }
    return block;
  });
}

/* --------------------------------------------------------------- household */

export function householdBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<HouseholdRiskFeed>('household');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const withMethod = (
      where: string,
      epc: EpcSpec | undefined,
      method?: string,
    ): CsvRow | null => {
      const row = airRow(where, epc);
      return row === null || method === undefined ? row : { ...row, method: methodName(method) };
    };
    const rows = [
      withMethod('Shower or bathroom air', f.bathroomAir, f.methods.bathroomAir),
      withMethod('Whole-house air', f.indoorAir, f.methods.householdAir),
      withMethod('Sprinkler spray air (outdoor)', f.outdoorSprinkler, f.methods.sprayAir),
      withMethod(
        'Windblown particulate air (outdoor)',
        f.outdoorParticulate,
        f.methods.particulateAir,
      ),
    ].filter((r): r is CsvRow => r !== null);
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Air concentrations sent to the exposure and risk screen: ${f.label}`],
      inputs: [],
      notes: [],
      tables: [],
    };
    if (rows.length === 0) block.notes.push('The sent result holds no air concentration.');
    else {
      block.tables.push(
        table(
          `household-air-${slug(id)}`,
          `household air concentrations, ${block.name}`,
          AIR_COLUMNS,
          rows,
        ),
      );
    }
    return block;
  });
}

/* ------------------------------------------------------------------ plants */

const PRODUCE_NAME: Record<string, string> = {
  abovegroundExposed: 'Exposed aboveground produce',
  abovegroundProtected: 'Protected aboveground produce',
  root: 'Root produce',
};

export function plantsBlocks(slots: Slots, nameOf: NameOf): ChemicalBlock[] {
  const held = slots<ProduceRiskFeed>('produce');
  return chemicalsOf([held]).map((id) => {
    const f = held.get(id)!;
    const classes = [...new Set([...Object.keys(f.factors), ...Object.keys(f.intakes)])];
    const block: ChemicalBlock = {
      chemicalId: id,
      name: nameFor(id, nameOf),
      sent: [`Homegrown produce factors sent to the exposure and risk screen: ${f.label}`],
      inputs: [
        { label: 'Plant uptake method', value: methodName(f.method) },
        { label: 'Intake', value: f.intakeLabel },
      ],
      notes: [],
      tables: [],
    };
    block.tables.push(
      table(
        `plants-produce-${slug(id)}`,
        `homegrown produce factors, ${block.name}`,
        [
          { key: 'produce', header: 'produce' },
          { key: 'factor', header: 'plant factor (produce per soil, fresh weight)', unit: 'kg/kg' },
          { key: 'intake', header: 'intake', unit: 'g/(kg d)' },
          { key: 'kg', header: 'intake', unit: 'kg/d' },
          { key: 'loss', header: 'preparation loss fraction' },
          { key: 'homegrown', header: 'fraction homegrown' },
        ],
        classes.map((c) => {
          const intake = (f.intakes as Record<string, Record<string, number> | undefined>)[c];
          return {
            produce: PRODUCE_NAME[c] ?? c,
            factor: (f.factors as Record<string, number | undefined>)[c] ?? null,
            intake: intake?.['gPerKgDay'] ?? null,
            kg: intake?.['kgPerDay'] ?? null,
            loss: intake?.['lossFraction'] ?? null,
            homegrown: intake?.['fractionHomegrown'] ?? null,
          };
        }),
      ),
    );
    return block;
  });
}

/** The screens that send a per-chemical result, and the block builder of each. */
export const BLOCK_BUILDERS: Partial<
  Record<ScreenKey, (slots: Slots, nameOf: NameOf) => ChemicalBlock[]>
> = {
  transport: transportBlocks,
  vadose: vadoseBlocks,
  saturated: saturatedBlocks,
  vapor: vaporBlocks,
  surfaceWater: surfaceWaterBlocks,
  household: householdBlocks,
  plantsEco: plantsBlocks,
};

/** Where each screen's sent results go: the feed that carries a result, and the screen that reads it. */
export const SENT_TO: Partial<Record<ScreenKey, Record<string, string>>> = {
  transport: { well: 'the exposure and risk screen', bank: 'the surface water screen' },
  vadose: { vadose: 'the groundwater screen', vaporVadose: 'the vapor screen' },
  saturated: { saturated: 'the groundwater screen', vaporSaturated: 'the vapor screen' },
  vapor: { vaporRisk: 'the exposure and risk screen' },
  surfaceWater: { surfaceWater: 'the exposure and risk screen' },
  household: { household: 'the exposure and risk screen' },
  plantsEco: { produce: 'the exposure and risk screen' },
};
