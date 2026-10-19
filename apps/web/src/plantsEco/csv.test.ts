import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import {
  ecoCsvRows,
  plantsEcoCsvTables,
  produceCsvRows,
  tphCsvRows,
  type PlantsEcoOutcome,
} from './csv';
import { ECO_LEGACY_ID, ECO_MODERN_ID } from './eco';

const none: PlantsEcoOutcome = {
  produce: { ok: false, errors: ['x'] },
  ecossl: { ok: false, errors: ['x'] },
  benchmarks: { ok: false, errors: ['x'] },
  tph: { ok: false, errors: ['x'] },
};

const produceOk = {
  ok: true as const,
  row: {
    methodId: 'plantUptake.hhrap-2005',
    classes: [
      { cls: 'root' as const, label: 'Root', factor: 0.002, plantMgPerKg: 0.04 },
      {
        cls: 'abovegroundExposed' as const,
        label: 'Above-ground, exposed',
        factor: null,
        plantMgPerKg: undefined,
      },
    ],
    factors: {} as never,
    intakes: {} as never,
    intakeLabel: 'user entered',
    omitted: [],
    warnings: [],
  },
};

const ecosslOk = {
  ok: true as const,
  result: {
    substance: 'Test substance',
    note: null,
    combined: false,
    warnings: [],
    rows: [
      {
        group: 'plants' as const,
        label: 'Plants',
        status: 'value' as const,
        sslMgPerKg: 100,
        hq: 0.5,
      },
      {
        group: 'avian' as const,
        label: 'Birds (wildlife)',
        status: 'NA' as const,
        sslMgPerKg: null,
        hq: null,
      },
    ],
  },
};

const benchmarksOk = {
  ok: true as const,
  rows: [{ receptor: 'Earthworm', citation: 'User supplied', valueMgPerKg: 20, hq: 2.5 }],
  warnings: [],
};

const tphOk = {
  ok: true as const,
  result: {
    methodId: 'tph.tphcwg',
    fractions: [
      {
        label: 'C9-C12',
        family: 'aliphatic' as const,
        massFraction: 0.4,
        mapped: true,
        levelMgPerKg: 500,
      },
      {
        label: 'C13-C16',
        family: 'aromatic' as const,
        massFraction: 0.6,
        mapped: false,
        levelMgPerKg: undefined,
      },
    ],
    unmapped: ['C13-C16'],
    totalMgPerKg: 1250,
    forward: {
      hazardIndex: 0.8,
      byFraction: [{ label: 'C9-C12', soilMgPerKg: 40, hazardQuotient: 0.08 }],
    },
    saturation: {
      index: 0.3,
      exceeded: false,
      perFraction: [{ label: 'C9-C12', limitMgPerKg: 1000, soilMgPerKg: 40, exceeded: false }],
    },
    warnings: [],
  },
};

describe('plants and ecology CSV', () => {
  it('has no tables when nothing computes', () => {
    expect(plantsEcoCsvTables(none)).toEqual([]);
  });

  it('writes plant factors with the method id and a blank for one the engine cannot quantify', () => {
    const rows = produceCsvRows(produceOk);
    expect(rows).toEqual([
      { method: 'plantUptake.hhrap-2005', produceClass: 'Root', factor: 0.002, plant: 0.04 },
      {
        method: 'plantUptake.hhrap-2005',
        produceClass: 'Above-ground, exposed',
        factor: null,
        plant: undefined,
      },
    ]);
  });

  it('writes Eco-SSL rows and user benchmark rows under their own method ids', () => {
    const rows = ecoCsvRows(ecosslOk, benchmarksOk);
    expect(rows.map((r) => [r.method, r.receptor, r.status])).toEqual([
      [ECO_MODERN_ID, 'Plants', 'value'],
      [ECO_MODERN_ID, 'Birds (wildlife)', 'NA'],
      [ECO_LEGACY_ID, 'Earthworm', 'user benchmark'],
    ]);
    expect(rows[2]).toMatchObject({ benchmark: 20, hq: 2.5, citation: 'User supplied' });
    expect(rows[1]).toMatchObject({ benchmark: null, hq: null });
  });

  it('writes the TPH level, forward hazard index, fraction levels and saturation index', () => {
    const rows = tphCsvRows(tphOk);
    const get = (q: string, item = '') =>
      rows.find((r) => r.quantity === q && (r.item ?? '') === item);
    expect(get('total TPH level for the target hazard index')).toMatchObject({
      method: 'tph.tphcwg',
      value: 1250,
      unit: 'mg/kg',
    });
    expect(get('hazard index of the entered composition')?.value).toBe(0.8);
    expect(get('level for a hazard quotient of one', 'C9-C12')?.value).toBe(500);
    expect(get('level for a hazard quotient of one', 'C13-C16')).toBeUndefined();
    expect(get('hazard quotient', 'C9-C12')?.value).toBe(0.08);
    expect(get('saturation index')?.value).toBe(0.3);
  });

  it('builds the tables that have rows and states the unit in each header', () => {
    const t = plantsEcoCsvTables({
      produce: produceOk,
      ecossl: ecosslOk,
      benchmarks: benchmarksOk,
      tph: tphOk,
    });
    expect(t.map((x) => x.name)).toEqual(['plants-produce', 'eco-screening', 'tph-results']);
    const header = (i: number) => exportCsv(t[i]!.rows, t[i]!.columns).split('\r\n')[0];
    expect(header(1)).toBe(
      'method,receptor,status,benchmark (mg/kg dry weight),hazard quotient (-),citation',
    );
  });
});
