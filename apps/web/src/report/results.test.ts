import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, type Screens } from '../project';
import { loadChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { computeResults, tableText, MAX_ROWS } from './results';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function project(edit: (s: Screens) => void) {
  const screens = defaultScreens();
  edit(screens);
  return buildProject({ screens, createdWith: '0.0.1', now: NOW });
}

describe('computeResults', () => {
  it('has no results for a new project', async () => {
    expect(await computeResults(project(() => {}))).toEqual({});
  });

  it('runs the vadose screen from its form through the screen CSV builders', async () => {
    const r = await computeResults(
      project((s) => {
        s.vadose = { ...s.vadose, form: { ...s.vadose.form, foc: '0.0123' } } as Screens['vadose'];
      }),
    );
    expect(Object.keys(r)).toEqual(['vadose']);
    const sec = r['vadose']!;
    expect(sec.tables.length).toBeGreaterThan(0);
    expect(sec.tables[0]!.rows.length).toBeGreaterThan(0);
    expect(sec.notes).toEqual([]);
  });

  it('runs the groundwater screen and carries the engine warnings with the origin', async () => {
    const r = await computeResults(
      project((s) => {
        s.transport = { ...s.transport, form: { ...s.transport.form, K: '12.5' } };
      }),
    );
    const sec = r['transport']!;
    expect(sec.tables.map((t) => t.name)).toEqual(['transport-results', 'transport-breakthrough']);
    for (const w of sec.warnings) {
      expect(typeof w.code).toBe('string');
      expect(typeof w.message).toBe('string');
    }
  });

  it('says what is wrong instead of a table when the inputs do not parse', async () => {
    const r = await computeResults(
      project((s) => {
        s.transport = { ...s.transport, form: { ...s.transport.form, K: 'abc' } };
      }),
    );
    expect(r['transport']!.tables).toEqual([]);
    expect(r['transport']!.notes[0]).toMatch(/^Not computed/);
  });

  it('runs the household and plants screens', async () => {
    const r = await computeResults(
      project((s) => {
        // Test inputs only; none of these is a sourced default.
        s.household = {
          form: {
            ...s.household.form,
            waterConcentration: '0.5',
            soilConcentration: '40',
            henry: '0.2',
            molecularWeight: '100',
            volatileOverride: 'volatile',
            householdFactor: '0.5',
            showerDropletDiameter: '1',
            showerFallTime: '2',
            showerFlow: '8',
            showerMinutes: '10',
            stallVolume: '2',
            ventilation: '0.5',
            postShowerMinutes: '5',
            sprayDropletDiameter: '1.5',
            sprayFallTime: '3',
            sprinklerFlow: '20',
            windSpeed: '2',
            mixingHeight: '2',
            boxLength: '10',
            boxWidth: '4',
          },
        };
        s.plantsEco = {
          form: {
            ...s.plantsEco.form,
            soilConcentration: '12',
            benchmarks: [{ receptor: 'Earthworm', value: '50', citation: 'sample1996' }],
          },
        };
      }),
    );
    expect(r['household']!.tables.map((t) => t.name)).toContain('household-results');
    expect(r['plantsEco']!.tables.length).toBeGreaterThan(0);
  });

  it('runs the saturated, vapor and surface water screens', async () => {
    const r = await computeResults(
      project((s) => {
        s.saturated = {
          ...s.saturated,
          form: { ...s.saturated.form, foc: '0.0123' },
        } as Screens['saturated'];
        s.vapor = { ...s.vapor, form: { ...s.vapor.form, floorArea: '120' } };
        s.surfaceWater = {
          form: { ...s.surfaceWater.form, volume: '3.3' },
        } as Screens['surfaceWater'];
      }),
    );
    expect(Object.keys(r).sort()).toEqual(['saturated', 'surfaceWater', 'vapor']);
    for (const k of ['saturated', 'vapor', 'surfaceWater'] as const) {
      expect(r[k]!.tables.length, k).toBeGreaterThan(0);
    }
  });

  it('says so when a used screen has no result yet', async () => {
    const r = await computeResults(
      project((s) => {
        s.household = { form: { ...s.household.form, waterConcentration: '0.5' } };
      }),
    );
    expect(r['household']!.tables).toEqual([]);
    expect(r['household']!.notes.join(' ')).toMatch(/no result yet/i);
  });

  it('runs the exposure and cleanup screens from the chemical database', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('71-43-2')!;
    const row = { ...newChemicalRow(rec), conc: { soil: '1', groundwater: '0.005' } };
    const r = await computeResults(
      project((s) => {
        s.risk = { form: { ...s.risk.form, chemicals: [row] } };
        s.cleanup = { form: { ...s.cleanup.form, chemicals: [newChemicalRow(rec)] } };
      }),
    );
    expect(r['risk']!.tables.map((t) => t.name)).toEqual(['risk-results', 'risk-contributions']);
    expect(r['risk']!.tables[0]!.rows.length).toBeGreaterThan(0);
    expect(r['cleanup']!.tables.map((t) => t.name)).toContain('cleanup-levels');
  }, 60000);

  it('notes that a modeled cleanup source needs the transport chain a saved project lacks', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('71-43-2')!;
    const r = await computeResults(
      project((s) => {
        s.cleanup = {
          form: { ...s.cleanup.form, source: 'vadose', chemicals: [newChemicalRow(rec)] },
        };
      }),
    );
    expect(r['cleanup']!.tables).toEqual([]);
    expect(r['cleanup']!.notes.join(' ')).toMatch(/modeled/i);
  }, 60000);

  it('notes that uncertainty runs are repeated from the setup, not saved', async () => {
    const r = await computeResults(
      project((s) => {
        s.uncertainty = {
          ...s.uncertainty,
          risk: { ...s.uncertainty.risk, sampling: 'lhs', seed: 'k' },
        };
      }),
    );
    expect(r['uncertainty']!.tables).toEqual([]);
    expect(r['uncertainty']!.notes.join(' ')).toMatch(/seed/);
  });
});

describe('tableText', () => {
  it('writes headers with units, blanks for missing cells and limits long tables', () => {
    const rows = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({
      a: i,
      b: i === 0 ? null : 'x',
    }));
    const t = tableText({
      name: 'n',
      label: 'l',
      rows,
      columns: [
        { key: 'a', header: 'a', unit: 'm' },
        { key: 'b', header: 'b' },
      ],
    });
    expect(t.headers).toEqual(['a (m)', 'b']);
    expect(t.rows.length).toBe(MAX_ROWS);
    expect(t.total).toBe(MAX_ROWS + 5);
    expect(t.rows[0]).toEqual(['0', '']);
  });

  it('shortens numbers to six significant digits', () => {
    const t = tableText({
      name: 'n',
      label: 'l',
      rows: [{ a: 0.123456789, b: 12345678, c: true }],
      columns: [
        { key: 'a', header: 'a' },
        { key: 'b', header: 'b' },
        { key: 'c', header: 'c' },
      ],
    });
    expect(t.rows[0]).toEqual(['0.123457', '12345700', 'true']);
  });
});
