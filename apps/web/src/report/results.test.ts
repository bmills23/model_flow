import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, feedEntry, type Screens } from '../project';
import { PATHWAY_IDS } from '@model-flow/engine';
import { loadChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { emptyOverrides, setField, type OverridesState } from '../overrides/model';
import { savedFixture } from '../cleanup/modeledLevels.testkit';
import {
  chainFingerprint,
  modeledLevelsFingerprint,
  type SavedModeledLevels,
} from '../cleanup/modeledLevels';
import { overridesOf, screensOf } from '../project';
import { withProjectReceptorEdits } from './userValues';
import { effectiveDb } from '../overrides/userChemicals';
import { computeResults, tableText } from './results';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function project(edit: (s: Screens) => void, feeds?: (s: Screens) => Record<string, unknown>) {
  const screens = defaultScreens();
  edit(screens);
  return buildProject({
    screens,
    ...(feeds ? { feeds: feeds(screens) as never } : {}),
    createdWith: '0.0.1',
    now: NOW,
  });
}

describe('computeResults with project overrides', () => {
  it('computes the exposure and cleanup sections with the overridden toxicity value', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('71-43-2')!;
    const row = { ...newChemicalRow(rec), conc: { groundwater: '0.005' } };
    const make = (overrides?: OverridesState) => {
      const screens = defaultScreens();
      screens.risk = { form: { ...screens.risk.form, chemicals: [row] } };
      screens.cleanup = { form: { ...screens.cleanup.form, chemicals: [newChemicalRow(rec)] } };
      return buildProject({
        screens,
        ...(overrides ? { overrides } : {}),
        createdWith: '0.0.1',
        now: NOW,
      });
    };
    const base = await computeResults(make());
    const edited = await computeResults(
      make({
        ...emptyOverrides(),
        toxicity: setField({}, '71-43-2', 'sfo', {
          value: String(rec.tox.sfo!.value * 10),
          note: 'n',
        }),
      }),
    );
    const text = (r: typeof base) => JSON.stringify([r['risk']!.tables, r['cleanup']!.tables]);
    expect(text(edited)).not.toBe(text(base));
  }, 60000);
});

describe('computeResults', () => {
  it('has no results for a new project', async () => {
    expect(await computeResults(project(() => {}))).toEqual({});
  });

  it('runs the vadose screen from its form through the screen CSV builders', async () => {
    const r = await computeResults(
      project((s) => {
        s.vadose = {
          ...s.vadose,
          form: { ...s.vadose.form, foc: '0.0123', dispersivityBasis: 'regression' },
        } as Screens['vadose'];
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
        s.transport = {
          ...s.transport,
          form: { ...s.transport.form, K: '12.5', dispLaw: 'legacy' },
        };
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

  it('adds the comparison with the saved criteria set to the surface water section, with the set and basis of every row', async () => {
    const make = (set: Screens['surfaceWater']['criteriaSet']) =>
      project((s) => {
        s.surfaceWater = {
          form: { ...s.surfaceWater.form, volume: '3.3', chemicalId: '71-43-2' },
          criteriaSet: set,
        } as Screens['surfaceWater'];
      });
    const us = (await computeResults(make('us')))['surfaceWater']!;
    const usTable = us.tables.find((t) => t.name === 'surface-water-criteria-us')!;
    expect(usTable.rows.length).toBeGreaterThan(0);
    expect(usTable.rows.every((r) => String(r['set']).includes('EPA'))).toBe(true);

    const ccme = (await computeResults(make('ccme')))['surfaceWater']!;
    const table = ccme.tables.find((t) => t.name === 'surface-water-criteria-ccme')!;
    expect(table.editions).toEqual(['criteria']);
    const text = tableText(table);
    expect(text.headers).toContain('criteria set');
    expect(text.headers).toContain('basis');
    expect(text.headers).toContain('source table');
    const row = table.rows.find(
      (r) => r['medium'] === 'surface water' && r['waterType'] === 'freshwater',
    )!;
    expect(row['set']).toMatch(/Canada \(CCME\)/);
    expect(row['basis']).toBe('long-term exposure guideline');
    expect(row['criterionValue']).toBeCloseTo(370, 6);
    expect(ccme.notes.join(' ')).toMatch(/Canada: CCME/);
    expect(ccme.tables.map((t) => t.name)).not.toContain('surface-water-criteria-us');
  }, 60000);

  it('leaves the surface water section as it was when the run has no chemical or the set has none for it', async () => {
    const r = (
      await computeResults(
        project((s) => {
          s.surfaceWater = {
            form: { ...s.surfaceWater.form, volume: '3.3' },
            criteriaSet: 'eu',
          } as Screens['surfaceWater'];
        }),
      )
    )['surfaceWater']!;
    expect(r.tables.map((t) => t.name)).toEqual([
      'surface-water-results',
      'surface-water-time-series',
    ]);
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

  it('adds the held produce and total TPH levels to the cleanup section, with their warnings', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('71-43-2')!;
    const on = ['soilIngestion'];
    const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)]));
    const r = await computeResults(
      project(
        (s) => {
          s.cleanup = {
            form: {
              ...s.cleanup.form,
              chemicals: [{ ...newChemicalRow(rec), produceFromPlantsEco: true }],
              a: { ...s.cleanup.form.a, pathways: pathways as never, produce: true },
            },
          };
        },
        (s) => ({
          produce: {
            '71-43-2': feedEntry('plantsEco', s.plantsEco.form, {
              chemicalId: '71-43-2',
              label: 'Benzene',
              method: 'plantUptake.hhrap-2005',
              factors: { root: 0.02 },
              intakes: { root: { gPerKgDay: 1.5, fractionHomegrown: 0.4 } },
              intakeLabel: 'user entered',
              warnings: [{ code: 'PLANT_TEST_WARNING', message: 'outside the fitted range' }],
            }),
          },
          tph: feedEntry('plantsEco', s.plantsEco.form, {
            methodId: 'tph.tphcwg',
            label: 'Total TPH, tph.tphcwg',
            targetHazardIndex: 1,
            totalMgPerKg: 640,
            fractions: [],
            unmapped: [],
            warnings: [{ code: 'TPH_TEST_WARNING', message: 'a fraction warning' }],
          }),
        }),
      ),
    );
    const sec = r['cleanup']!;
    expect(sec.tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['cleanup-levels', 'cleanup-pathways', 'cleanup-tph']),
    );
    const paths = sec.tables.find((t) => t.name === 'cleanup-pathways')!;
    expect(paths.rows.some((x) => String(x.pathway).toLowerCase().includes('produce'))).toBe(true);
    expect(sec.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['PLANT_TEST_WARNING', 'TPH_TEST_WARNING']),
    );
  }, 60000);

  it('adds the held household, vapor and surface water source levels to the cleanup section', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('71-43-2')!;
    const on = ['showerInhalation', 'indoorInhalation', 'outdoorInhalation', 'swimIngestion'];
    const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)]));
    const epc = { kind: 'constant', value: 1e-6, origin: 'x' };
    const r = await computeResults(
      project(
        (s) => {
          s.cleanup = {
            form: {
              ...s.cleanup.form,
              chemicals: [newChemicalRow(rec)],
              a: { ...s.cleanup.form.a, pathways: pathways as never },
            },
          };
        },
        (s) => ({
          household: {
            '71-43-2': feedEntry('household', s.household.form, {
              chemicalId: '71-43-2',
              label: 'Benzene, household run',
              coefficients: { bathroomAir: 0.002 },
              methods: { bathroomAir: 'shower.little-1992' },
            }),
          },
          vaporRisk: {
            '71-43-2': feedEntry('vapor', s.vapor.form, {
              chemicalId: '71-43-2',
              label: 'Benzene, vapor run',
              indoor: epc,
              outdoor: epc,
              coefficients: {
                indoor: {
                  quantified: true,
                  methodId: 'vapor.je-1991',
                  value: 2e-4,
                  source: 'groundwater',
                },
                outdoor: {
                  quantified: false,
                  methodId: 'outdoorAir.box',
                  reason: 'TPH mixture in the soil',
                },
              },
            }),
          },
          surfaceWater: {
            '': feedEntry('surfaceWater', s.surfaceWater.form, {
              method: 'mass-discharge',
              origin: 'surfaceWater.mass-discharge',
              label: 'Modern mass-discharge surface water',
              times: [1],
              values: [1e-6],
            }),
          },
        }),
      ),
    );
    const sec = r['cleanup']!;
    const names = sec.tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'cleanup-household-levels',
        'cleanup-vapor-levels',
        'cleanup-surface-water-levels',
      ]),
    );
    const vapor = sec.tables.find((t) => t.name === 'cleanup-vapor-levels')!;
    expect(vapor.rows.some((x) => x.reason === 'TPH mixture in the soil' && x.level === null)).toBe(
      true,
    );
    const sw = sec.tables.find((t) => t.name === 'cleanup-surface-water-levels')!;
    expect(sw.rows.every((x) => x.level === null && /again/i.test(String(x.reason)))).toBe(true);
    expect(sec.notes.join(' ')).not.toMatch(/on the screen only/i);
  }, 60000);

  it('says a modeled cleanup source has no kept levels yet and what to do', async () => {
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
    const text = r['cleanup']!.notes.join(' ');
    expect(text).toMatch(/modeled cleanup levels/i);
    expect(text).toMatch(/not been solved/i);
    expect(text).toMatch(/open the cleanup screen/i);
  }, 60000);

  it('names every chemical row of a modeled cleanup source that has no kept levels', async () => {
    const db = await loadChemicalDb();
    const a = newChemicalRow(db.byId.get('71-43-2')!);
    const b = newChemicalRow(db.byId.get('108-88-3')!);
    const r = await computeResults(
      project((s) => {
        s.cleanup = { form: { ...s.cleanup.form, source: 'vadose', chemicals: [a, b] } };
      }),
    );
    const text = r['cleanup']!.notes.join(' ');
    expect(text).toContain(`${a.name}: `);
    expect(text).toContain(`${b.name}: `);
    expect(text.match(/not been solved/gi)?.length).toBe(2);
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

describe('computeResults, one block per chemical', () => {
  const YR = 365.25 * 86400;
  const well = (id: string, peak: number) => ({
    method: 'modern' as const,
    label: 'Receptor well, modern method, 15 years',
    chemicalId: id,
    times: [0, YR, 2 * YR],
    values: [0, peak, peak / 2],
  });
  const air = (id: string, peak: number) => ({
    chemicalId: id,
    label: 'Vapor run',
    indoor: {
      kind: 'series',
      series: { times: [0, YR], values: [0, peak] },
      origin: 'vapor.je-1991',
    },
  });

  it('prints the benzene well and indoor air results although the screens last ran MTBE', async () => {
    const r = await computeResults(
      project(
        (s) => {
          s.transport = { ...s.transport, form: { ...s.transport.form, chemicalId: '1634-04-4' } };
          s.vapor = { ...s.vapor, form: { ...s.vapor.form, chemicalId: '1634-04-4' } };
        },
        (s) => ({
          well: {
            '71-43-2': feedEntry('transport', s.transport.form, well('71-43-2', 2e-3)),
            '1634-04-4': feedEntry('transport', s.transport.form, well('1634-04-4', 8e-3)),
          },
          vaporRisk: {
            '71-43-2': feedEntry('vapor', s.vapor.form, air('71-43-2', 3e-6)),
            '1634-04-4': feedEntry('vapor', s.vapor.form, air('1634-04-4', 1e-6)),
          },
        }),
      ),
    );
    const gw = r['transport']!;
    expect(gw.chemicals!.map((b) => b.name)).toEqual(['Benzene', expect.stringMatching(/butyl/i)]);
    expect(gw.chemicals![0]!.tables.length).toBeGreaterThan(0);
    const vapor = r['vapor']!;
    expect(vapor.chemicals!.map((b) => b.name)).toEqual([
      'Benzene',
      expect.stringMatching(/butyl/i),
    ]);
    expect(vapor.chemicals![0]!.tables[0]!.rows[0]).toMatchObject({
      where: 'Indoor air',
      concentration: 3,
    });
    // the screens' own tables are the MTBE run, named by name and marked as sent
    expect(gw.current).toEqual({
      chemical: expect.stringMatching(/butyl/i),
      sentTo: 'the exposure and risk screen',
    });
  }, 60000);

  it('labels the run on the screen as not sent when no result was sent for its chemical', async () => {
    const r = await computeResults(
      project(
        (s) => {
          s.transport = { ...s.transport, form: { ...s.transport.form, chemicalId: '108-88-3' } };
        },
        (s) => ({
          well: { '71-43-2': feedEntry('transport', s.transport.form, well('71-43-2', 2e-3)) },
        }),
      ),
    );
    const gw = r['transport']!;
    expect(gw.chemicals!.map((b) => b.name)).toEqual(['Benzene']);
    expect(gw.current).toEqual({ chemical: 'Toluene', sentTo: null });
  }, 60000);

  it('says the screen run changed since it was sent when the transport inputs were edited and not sent again', async () => {
    const sent = defaultScreens();
    sent.transport = { ...sent.transport, form: { ...sent.transport.form, chemicalId: '71-43-2' } };
    const now = defaultScreens();
    now.transport = {
      ...now.transport,
      form: { ...now.transport.form, chemicalId: '71-43-2', K: '77' },
    };
    const p = buildProject({
      screens: now,
      feeds: {
        well: { '71-43-2': feedEntry('transport', sent.transport.form, well('71-43-2', 2e-3)) },
      } as never,
      createdWith: '0.0.1',
      now: NOW,
    });
    const gw = (await computeResults(p))['transport']!;
    // the block still prints the sent run; the screen's own tables are a different run
    expect(gw.chemicals!.map((b) => b.name)).toEqual(['Benzene']);
    expect(gw.current).toEqual({
      chemical: 'Benzene',
      sentTo: null,
      changedSince: 'the exposure and risk screen',
    });
  }, 60000);

  it('keeps saying the run was sent while the transport inputs still match the send', async () => {
    const same = defaultScreens();
    same.transport = { ...same.transport, form: { ...same.transport.form, chemicalId: '71-43-2' } };
    const p = buildProject({
      screens: same,
      feeds: {
        well: { '71-43-2': feedEntry('transport', same.transport.form, well('71-43-2', 2e-3)) },
      } as never,
      createdWith: '0.0.1',
      now: NOW,
    });
    const gw = (await computeResults(p))['transport']!;
    expect(gw.current).toEqual({ chemical: 'Benzene', sentTo: 'the exposure and risk screen' });
  }, 60000);

  it('has no block and only the current run label for a screen that sent nothing', async () => {
    const r = await computeResults(
      project((s) => {
        s.transport = { ...s.transport, form: { ...s.transport.form, K: '12.5' } };
      }),
    );
    expect(r['transport']!.chemicals).toBeUndefined();
    expect(r['transport']!.current).toEqual({
      chemical: 'a chemical entered by hand',
      sentTo: null,
    });
  }, 60000);

  it('still labels the run and prints the sent blocks when the screen itself did not compute', async () => {
    const r = await computeResults(
      project(
        (s) => {
          s.transport = { ...s.transport, form: { ...s.transport.form, K: 'abc' } };
        },
        (s) => ({
          well: { '71-43-2': feedEntry('transport', s.transport.form, well('71-43-2', 2e-3)) },
        }),
      ),
    );
    expect(r['transport']!.notes.join(' ')).toMatch(/^Not computed/);
    expect(r['transport']!.chemicals!.map((b) => b.name)).toEqual(['Benzene']);
    expect(r['transport']!.current).toBeDefined();
  }, 60000);
});

describe('computeResults, the surface water method basis', () => {
  const sw = (chemicalId: string, method: 'well-mixed' | 'mass-discharge') => ({
    method,
    origin: `surfaceWater.${method}`,
    label: 'sent surface water',
    chemicalId,
    times: [1],
    values: [1e-6],
  });
  const make = (formChemical: string, sent: Record<string, ReturnType<typeof sw>>) => {
    const screens = defaultScreens();
    screens.surfaceWater = {
      form: { ...screens.surfaceWater.form, volume: '3.3', chemicalId: formChemical },
    } as Screens['surfaceWater'];
    return buildProject({
      screens,
      feeds: {
        surfaceWater: Object.fromEntries(
          Object.entries(sent).map(([id, v]) => [
            id,
            feedEntry('surfaceWater', screens.surfaceWater.form, v),
          ]),
        ),
      } as never,
      createdWith: '0.0.1',
      now: NOW,
    });
  };

  it('does not take another chemical sent method when the form is on a chemical nothing was sent for', async () => {
    const r = await computeResults(make('108-88-3', { '71-43-2': sw('71-43-2', 'well-mixed') }));
    const basis = r['surfaceWater']!.methodBasis!;
    expect(basis.basis).toBe('modern method');
    expect(basis.statement).toMatch(
      /No method was sent to the exposure and risk screen for this chemical/,
    );
    expect(basis.statement).not.toMatch(/the one sent/);
  }, 60000);

  it('takes the method sent for the chemical the form is on', async () => {
    const r = await computeResults(
      make('71-43-2', {
        '71-43-2': sw('71-43-2', 'well-mixed'),
        '108-88-3': sw('108-88-3', 'mass-discharge'),
      }),
    );
    const basis = r['surfaceWater']!.methodBasis!;
    expect(basis.basis).toBe('legacy method');
    expect(basis.statement).toMatch(/the one sent to the exposure and risk screen/);
  }, 60000);
});

describe('tableText', () => {
  it('writes headers with units and blanks for missing cells', () => {
    const t = tableText({
      name: 'n',
      label: 'l',
      rows: [{ a: 0, b: null }],
      columns: [
        { key: 'a', header: 'a', unit: 'm' },
        { key: 'b', header: 'b' },
      ],
    });
    expect(t.headers).toEqual(['a (m)', 'b']);
    expect(t.rows[0]).toEqual(['0', '']);
  });

  it('prints "not quantified" for an empty cell of a missing-value column, and only there', () => {
    const t = tableText({
      name: 'n',
      label: 'l',
      rows: [
        { value: 3, other: null, why: '' },
        { value: null, other: null, why: 'no cancer toxicity value for this route' },
        { value: 0, other: null, why: '' },
      ],
      columns: [
        { key: 'value', header: 'value' },
        { key: 'other', header: 'other' },
        { key: 'why', header: 'not quantified because' },
      ],
      missing: { keys: ['value'], because: 'why' },
    });
    expect(t.rows).toEqual([
      ['3', '', ''],
      ['not quantified', '', 'no cancer toxicity value for this route'],
      ['0', '', ''],
    ]);
  });

  it('never truncates a table: every row is printed', () => {
    const rows = Array.from({ length: 125 }, (_, i) => ({ a: i }));
    const t = tableText({ name: 'n', label: 'l', rows, columns: [{ key: 'a', header: 'a' }] });
    expect(t.rows.length).toBe(125);
    expect(t.rows[124]).toEqual(['124']);
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

describe('computeResults charts', () => {
  const kinds = async (edit: (s: Screens) => void, key: string): Promise<string[]> => {
    const r = await computeResults(project(edit));
    return (r[key as keyof typeof r]?.charts ?? []).map((c) => c.kind);
  };

  it('carries the plume map and the breakthrough chart of the groundwater screen', async () => {
    const k = await kinds((s) => {
      s.transport = { ...s.transport, form: { ...s.transport.form, K: '12.5', dispLaw: 'legacy' } };
    }, 'transport');
    expect(k).toEqual(['plume', 'breakthrough']);
  });

  it('carries the three vadose charts and the two saturated charts', async () => {
    const v = await kinds((s) => {
      s.vadose = {
        ...s.vadose,
        form: { ...s.vadose.form, foc: '0.0123', dispersivityBasis: 'regression' },
      } as Screens['vadose'];
    }, 'vadose');
    expect(v).toEqual(['vadoseDepth', 'vadoseWaterTable', 'vadoseDepletion']);
    const sat = await kinds((s) => {
      s.saturated = { ...s.saturated, form: { ...s.saturated.form, horizonYr: '20' } };
    }, 'saturated');
    expect(sat).toEqual(['saturatedRate', 'saturatedRemaining']);
  });

  it('has no charts for a screen that did not compute', async () => {
    const k = await kinds((s) => {
      s.transport = { ...s.transport, form: { ...s.transport.form, K: 'abc' } };
    }, 'transport');
    expect(k).toEqual([]);
  });
});

describe('computeResults with receptor edits only', () => {
  it('does not count an otherwise untouched risk or cleanup screen as used', async () => {
    const overrides: OverridesState = {
      ...emptyOverrides(),
      receptorNames: { 'risk.a': 'North lot worker', 'cleanup.a': 'Yard worker' },
      receptors: setField({}, 'risk.a', 'legacy.bwKg', { value: '60', note: '' }),
    };
    const p = buildProject({
      screens: defaultScreens(),
      overrides,
      createdWith: '0.0.1',
      now: NOW,
    });
    const r = await computeResults(p);
    expect(r['risk']).toBeUndefined();
    expect(r['cleanup']).toBeUndefined();
  });
});

describe('computeResults, modeled cleanup levels kept with the project', () => {
  const edition = async () => (await loadChemicalDb()).edition;

  async function withKept(
    rowIds: string[],
    keep: (fp: (id: string) => string) => Record<string, SavedModeledLevels>,
    edit: (s: Screens) => void = () => {},
  ) {
    const db = await loadChemicalDb();
    const make = (modeledLevels?: Record<string, SavedModeledLevels>) => {
      const screens = defaultScreens();
      screens.cleanup = {
        form: {
          ...screens.cleanup.form,
          source: 'dissolved',
          chemicals: rowIds.map((id) => newChemicalRow(db.byId.get(id)!)),
        },
      };
      edit(screens);
      return buildProject({
        screens,
        ...(modeledLevels ? { modeledLevels } : {}),
        createdWith: '0.0.1',
        now: NOW,
      });
    };
    const bare = make();
    const saved = withProjectReceptorEdits(screensOf(bare), overridesOf(bare));
    const fp = (id: string): string =>
      modeledLevelsFingerprint({
        cleanup: saved.cleanup.form,
        chemicalId: id,
        chain: chainFingerprint(saved.transport.form),
        vadose: null,
        saturated: null,
        rec: db.byId.get(id),
        edition: db.edition,
      });
    return computeResults(make(keep(fp)));
  }

  it('prints the levels while the fingerprint of the inputs matches', async () => {
    const r = await withKept(['1330-20-7'], (fp) => ({
      '1330-20-7': savedFixture({ fingerprint: fp('1330-20-7') }),
    }));
    const sec = r['cleanup']!;
    const table = sec.tables.find((t) => t.name === 'cleanup-modeled-levels')!;
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ chemical: 'Xylenes', level: 481 });
    expect(sec.notes.join(' ')).not.toMatch(/not computed|out of date|not been solved/i);
    expect(sec.warnings.some((w) => /aquifer/i.test(w.message))).toBe(true);
  }, 60000);

  it('flags a dissolved level above the chemical solubility, with the solubility and its source', async () => {
    const r = await withKept(['1330-20-7'], (fp) => ({
      '1330-20-7': savedFixture({ fingerprint: fp('1330-20-7') }),
    }));
    const sec = r['cleanup']!;
    const row = sec.tables.find((t) => t.name === 'cleanup-modeled-levels')!.rows[0]!;
    expect(String(row['solubility'])).toMatch(/481 mg\/L is above the solubility of 106 mg\/L/);
    expect(String(row['solubility'])).toContain(await edition());
    expect(sec.notes.join(' ')).toMatch(/above the solubility of 106 mg\/L/);
  }, 60000);

  it('lets a solubility ceiling the user entered win over the database value', async () => {
    const r = await withKept(
      ['1330-20-7'],
      (fp) => ({ '1330-20-7': savedFixture({ fingerprint: fp('1330-20-7') }) }),
      (s) => {
        s.cleanup = { form: { ...s.cleanup.form, solubility: '1000' } };
      },
    );
    const row = r['cleanup']!.tables.find((t) => t.name === 'cleanup-modeled-levels')!.rows[0]!;
    expect(row['solubility']).toBe('');
  }, 60000);

  it('says the kept levels are out of date when an input changed, and prints none of them', async () => {
    const r = await withKept(['1330-20-7'], () => ({
      '1330-20-7': savedFixture({ fingerprint: 'not-the-current-one' }),
    }));
    const sec = r['cleanup']!;
    expect(sec.tables.find((t) => t.name === 'cleanup-modeled-levels')).toBeUndefined();
    const text = sec.notes.join(' ');
    expect(text).toMatch(/out of date/i);
    expect(text).toMatch(/cleanup screen/i);
    expect(text).toMatch(/solves them again/i);
  }, 60000);

  it('judges each chemical on its own', async () => {
    const r = await withKept(['1330-20-7', '108-88-3'], (fp) => ({
      '1330-20-7': savedFixture({ fingerprint: fp('1330-20-7') }),
      '108-88-3': savedFixture({
        chemicalId: '108-88-3',
        chemical: 'Toluene',
        fingerprint: 'old',
      }),
    }));
    const sec = r['cleanup']!;
    expect(sec.tables.map((t) => t.name)).toEqual(['cleanup-modeled-levels-1330-20-7']);
    expect(sec.tables[0]!.label).toMatch(/Xylenes/);
    const text = sec.notes.join(' ');
    expect(text).toMatch(/Toluene[^.]*out of date/i);
    expect(text).not.toMatch(/Xylenes[^.]*out of date/i);
  }, 60000);

  describe('two chemicals, each judged against its own groundwater run', () => {
    // the groundwater screen is set to Toluene (Kd and chemical differ from the run Xylenes was sent with)
    // and its velocity was edited after the Xylenes run was sent
    const onToluene = (s: Screens) => {
      s.transport = {
        ...s.transport,
        form: { ...s.transport.form, chemicalId: '108-88-3', kd: '3.3', K: '99' },
      } as Screens['transport'];
    };
    const xylenesRun = 'run-sent-for-xylenes';
    const keepBoth = (fp: (id: string, chain: string) => string) => ({
      '1330-20-7': savedFixture({ fingerprint: fp('1330-20-7', xylenesRun) }),
    });

    async function judged(session: Parameters<typeof computeResults>[1]) {
      const db = await loadChemicalDb();
      const screens = defaultScreens();
      screens.cleanup = {
        form: {
          ...screens.cleanup.form,
          source: 'dissolved',
          chemicals: ['1330-20-7', '108-88-3'].map((id) => newChemicalRow(db.byId.get(id)!)),
        },
      };
      onToluene(screens);
      const saved = withProjectReceptorEdits(
        screens,
        overridesOf(buildProject({ screens, createdWith: '0', now: NOW })),
      );
      const fp = (id: string, chain: string): string =>
        modeledLevelsFingerprint({
          cleanup: saved.cleanup.form,
          chemicalId: id,
          chain,
          vadose: null,
          saturated: null,
          rec: db.byId.get(id),
          edition: db.edition,
        });
      return computeResults(
        buildProject({ screens, modeledLevels: keepBoth(fp), createdWith: '0.0.1', now: NOW }),
        session,
      );
    }

    it('prints the levels of a chemical whose run is held, after another chemical was picked on the groundwater screen', async () => {
      const r = await judged({ chainHash: (id) => (id === '1330-20-7' ? xylenesRun : undefined) });
      const sec = r['cleanup']!;
      expect(sec.tables.map((t) => t.name)).toEqual(['cleanup-modeled-levels-1330-20-7']);
      expect(sec.notes.join(' ')).not.toMatch(/Xylenes[^.]*(out of date|cannot be confirmed)/i);
    }, 60000);

    it('calls the levels out of date when the run held for the chemical is a different one', async () => {
      const r = await judged({ chainHash: () => 'a-run-sent-after-an-edit' });
      const sec = r['cleanup']!;
      expect(sec.tables).toEqual([]);
      expect(sec.notes.join(' ')).toMatch(/Xylenes[^.]*out of date/i);
    }, 60000);

    it('says the levels cannot be confirmed when no run is held and the screen is set to another chemical', async () => {
      const r = await judged({});
      const sec = r['cleanup']!;
      expect(sec.tables).toEqual([]);
      const text = sec.notes.join(' ');
      expect(text).toMatch(
        /Xylenes: The modeled cleanup levels kept with this project cannot be confirmed/,
      );
      expect(text).toMatch(/not saved with the project/);
    }, 60000);
  });

  it('says a kept entry that could not be read could not be read, and that the cleanup screen solves it again', async () => {
    const db = await loadChemicalDb();
    const screens = defaultScreens();
    screens.cleanup = {
      form: {
        ...screens.cleanup.form,
        source: 'dissolved',
        chemicals: [newChemicalRow(db.byId.get('1330-20-7')!)],
      },
    };
    const doc = JSON.parse(
      JSON.stringify(
        buildProject({
          screens,
          modeledLevels: { '1330-20-7': savedFixture() },
          createdWith: '0.0.1',
          now: NOW,
        }),
      ),
    ) as Record<string, unknown>;
    (doc['modeledLevels'] as Record<string, unknown>)['1330-20-7'] = {
      chemicalId: '1330-20-7',
      nonsense: 1,
    };
    const r = await computeResults(doc as never);
    const text = r['cleanup']!.notes.join(' ');
    expect(text).toMatch(/could not be read/);
    expect(text).toMatch(/cleanup screen[^.]*solves them again/);
    expect(text).not.toMatch(/have not been solved/);
  }, 60000);

  it('holds a user-defined chemical against the solubility the user entered for it, labelled as theirs', async () => {
    const base = await loadChemicalDb();
    const chemicals = [
      {
        id: 'user-1',
        name: 'Mine',
        values: {
          rfdo: { value: '0.02', note: 'lab memo' },
          s: { value: '42', note: 'measured at the site' },
        },
      },
    ];
    const db = effectiveDb(base, emptyOverrides(), chemicals);
    const screens = defaultScreens();
    screens.cleanup = {
      form: {
        ...screens.cleanup.form,
        source: 'dissolved',
        chemicals: [newChemicalRow(db.byId.get('user-1')!)],
      },
    };
    const fp = modeledLevelsFingerprint({
      cleanup: screens.cleanup.form,
      chemicalId: 'user-1',
      chain: chainFingerprint(screens.transport.form),
      vadose: null,
      saturated: null,
      rec: db.byId.get('user-1'),
      edition: db.edition,
    });
    const r = await computeResults(
      buildProject({
        screens,
        chemicals,
        modeledLevels: {
          'user-1': savedFixture({ chemicalId: 'user-1', chemical: 'Mine', fingerprint: fp }),
        },
        createdWith: '0.0.1',
        now: NOW,
      }),
    );
    const sec = r['cleanup']!;
    const row = sec.tables.find((t) => t.name === 'cleanup-modeled-levels')!.rows[0]!;
    expect(String(row['solubility'])).toMatch(/481 mg\/L is above the solubility of 42 mg\/L/);
    expect(String(row['solubility'])).toMatch(/entered by the user/);
    expect(String(row['solubility'])).not.toMatch(/Regional Screening Levels/);
    expect(sec.notes.join(' ')).toMatch(
      /Solubility used for Mine: 42 mg\/L \(a solubility entered by the user/,
    );
  }, 60000);

  it('leaves a level that is not reached empty and gives the reason', async () => {
    const base = savedFixture();
    const m = base.methods.modern!;
    if (!m.ok) throw new Error('fixture');
    const r = await withKept(['1330-20-7'], (fp) => ({
      '1330-20-7': savedFixture({
        fingerprint: fp('1330-20-7'),
        methods: { modern: { ...m, level: null, limiting: null } },
      }),
    }));
    const row = r['cleanup']!.tables.find((t) => t.name === 'cleanup-modeled-levels')!.rows[0]!;
    expect(row['level']).toBeNull();
    expect(String(row['note'])).toMatch(/not reached/);
    const text = tableText(r['cleanup']!.tables.find((t) => t.name === 'cleanup-modeled-levels')!);
    expect(text.rows.flat().join(' ')).toContain('not quantified');
  }, 60000);
});
