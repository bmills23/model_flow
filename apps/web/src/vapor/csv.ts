import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { VaporOutcome } from './compute';
import { OXYGEN_MODES } from './oxygenLimited';
import {
  INDOOR_ORIGIN,
  OUTDOOR_ORIGIN,
  type MethodKey,
  type OutdoorKey,
  type VaporEpcs,
} from './series';

const MGM3 = 1e-6; // kg/m3 per mg/m3
const METHODS: readonly MethodKey[] = ['legacy', 'modern', 'devaull'];
const OUTDOOR_METHODS: readonly OutdoorKey[] = ['legacy', 'modern'];

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'indoor', header: 'indoor air concentration', unit: 'mg/m3' },
  { key: 'alpha', header: 'attenuation coefficient', unit: '-' },
  { key: 'sourceVapor', header: 'source vapor concentration', unit: 'mg/m3' },
  { key: 'LT', header: 'source to building distance', unit: 'm' },
  { key: 'DT', header: 'effective diffusion through the soil', unit: 'cm2/s' },
  { key: 'QB', header: 'building ventilation', unit: 'L/s' },
  { key: 'Qsoil', header: 'soil gas entry', unit: 'L/min' },
  { key: 'xi', header: 'Peclet number', unit: '-' },
  { key: 'entryRate', header: 'entry rate', unit: 'mg/s' },
];

const OXYGEN_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'oxygenOption', header: 'oxygen option' },
  { key: 'indoor', header: 'indoor air concentration', unit: 'mg/m3' },
  { key: 'coefficient', header: 'attenuation coefficient', unit: '-' },
  { key: 'sourceVapor', header: 'source vapor concentration', unit: 'mg/m3' },
  { key: 'aerobicDepth', header: 'aerobic layer thickness', unit: 'm' },
  { key: 'anaerobicDepth', header: 'anaerobic layer thickness', unit: 'm' },
  { key: 'aerobicFraction', header: 'aerobic fraction of the column', unit: '-' },
  { key: 'a', header: 'aerobic thickness over reaction length', unit: '-' },
  { key: 'Ca', header: 'vapor at the top of the anaerobic layer', unit: 'mg/m3' },
  { key: 'Cb', header: 'vapor at the base of the foundation', unit: 'mg/m3' },
  { key: 'fluxTop', header: 'flux into the building', unit: 'mg/(m2 s)' },
  { key: 'degraded', header: 'degraded in the aerobic layer', unit: 'mg/(m2 s)' },
  { key: 'Deff', header: 'effective diffusion through the soil', unit: 'cm2/s' },
  { key: 'oxygenDeff', header: 'effective oxygen diffusion through the soil', unit: 'cm2/s' },
  { key: 'demandVapor', header: 'hydrocarbon vapor setting the oxygen demand', unit: 'mg/m3' },
  { key: 'wholly', header: 'column wholly' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'medium', header: 'medium' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'concentration', header: 'concentration', unit: 'mg/m3' },
];

export function vaporResultRows(out: VaporOutcome): CsvRow[] {
  return METHODS.flatMap((m): CsvRow[] => {
    if (m === 'devaull') {
      const d = out.devaull;
      if (!d?.ok) return [];
      const r = d.result;
      return [
        {
          method: INDOOR_ORIGIN.devaull,
          indoor: r.concentration / MGM3,
          alpha: r.coefficient,
          sourceVapor: r.sourceVapor / MGM3,
          LT: r.aerobicDepth + r.anaerobicDepth,
          DT: r.Deff * 1e4,
          QB: null,
          Qsoil: null,
          xi: null,
          entryRate: null,
        },
      ];
    }
    const o = out[m];
    if (!o.ok) return [];
    const r = o.result;
    return [
      {
        method: INDOOR_ORIGIN[m],
        indoor: r.concentration / MGM3,
        alpha: r.alpha,
        sourceVapor: r.sourceVapor / MGM3,
        LT: r.LT,
        DT: r.DT * 1e4,
        QB: r.QB * 1e3,
        Qsoil: r.Qsoil * 6e4,
        xi: r.xi,
        entryRate: r.entryRate * 1e6,
      },
    ];
  });
}

/** The oxygen-limited method's layers, fluxes and oxygen balance: one row, only when the method ran. */
export function vaporOxygenRows(out: VaporOutcome): CsvRow[] {
  const d = out.devaull;
  if (!d?.ok) return [];
  const r = d.result;
  const mode = r.oxygen?.mode ?? 'entered';
  return [
    {
      method: INDOOR_ORIGIN.devaull,
      oxygenOption: OXYGEN_MODES.find((m) => m.value === mode)?.label ?? mode,
      indoor: r.concentration / MGM3,
      coefficient: r.coefficient,
      sourceVapor: r.sourceVapor / MGM3,
      aerobicDepth: r.aerobicDepth,
      anaerobicDepth: r.anaerobicDepth,
      aerobicFraction: r.aerobicFraction,
      a: r.a,
      Ca: r.Ca / MGM3,
      Cb: r.Cb / MGM3,
      fluxTop: r.fluxTop * 1e6,
      degraded: r.degradationRate * 1e6,
      Deff: r.Deff * 1e4,
      oxygenDeff: r.oxygen ? r.oxygen.Deff * 1e4 : null,
      demandVapor: r.oxygen ? r.oxygen.demandVapor / MGM3 : null,
      wholly: r.oxygen?.wholly ?? null,
    },
  ];
}

/** Indoor and outdoor air against time for a source offered by another screen; one value gives one row each. */
export function vaporSeriesRows(epcs: VaporEpcs): CsvRow[] {
  const rows: CsvRow[] = [];
  const add = (method: string, medium: string, e: VaporEpcs['indoor'][MethodKey]): void => {
    if (!e) return;
    if (e.kind === 'constant') {
      rows.push({ method, medium, time: null, concentration: e.value / MGM3 });
      return;
    }
    e.series.times.forEach((t, i) => {
      rows.push({
        method,
        medium,
        time: convert(t, 's', 'yr'),
        concentration: e.series.values[i]! / MGM3,
      });
    });
  };
  for (const m of METHODS) add(INDOOR_ORIGIN[m], 'indoor air', epcs.indoor[m]);
  for (const m of OUTDOOR_METHODS) add(OUTDOOR_ORIGIN[m], 'outdoor air', epcs.outdoor[m]);
  return rows;
}

export function vaporCsvTables(out: VaporOutcome, epcs: VaporEpcs | null): CsvTable[] {
  const tables: CsvTable[] = [
    {
      name: 'vapor-results',
      label: 'results',
      rows: vaporResultRows(out),
      columns: RESULT_COLUMNS,
    },
  ];
  if (out.devaull) {
    tables.push({
      name: 'vapor-oxygen-limited',
      label: 'oxygen-limited details',
      rows: vaporOxygenRows(out),
      columns: OXYGEN_COLUMNS,
    });
  }
  if (epcs) {
    tables.push({
      name: 'vapor-time-series',
      label: 'time series',
      rows: vaporSeriesRows(epcs),
      columns: SERIES_COLUMNS,
    });
  }
  return tables;
}
