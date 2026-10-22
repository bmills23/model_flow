import { registry } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { defaultScreens, type Screens } from '../project';
import * as transportProject from '../transport/project';
import * as vadoseProject from '../vadose/project';
import { DEFAULT_FORM as TRANSPORT_FORM } from '../transport/form';
import { DEFAULT_FORM as VADOSE_FORM } from '../vadose/form';
import { dataEditionsFor, methodsRun, screenUsed, USED_SCREENS_ORDER } from './methodsRun';

const base = (): Screens => defaultScreens();

describe('screenUsed', () => {
  it('is false for every screen of a new project', () => {
    const s = base();
    for (const k of USED_SCREENS_ORDER) expect(screenUsed(k, s)).toBe(false);
  });

  it('is true for the screen whose form was edited and only that one', () => {
    const s = base();
    s.vadose = { ...s.vadose, form: { ...s.vadose.form, foc: '0.0123' } } as Screens['vadose'];
    expect(screenUsed('vadose', s)).toBe(true);
    expect(screenUsed('saturated', s)).toBe(false);
  });
});

describe('screenUsed on a project saved before wave R', () => {
  const old = (): Screens => {
    const s = base();
    s.transport = transportProject.fromProject({ form: { ...TRANSPORT_FORM, dispLaw: 'legacy' } });
    s.vadose = vadoseProject.fromProject({
      form: { ...VADOSE_FORM, dispersivityBasis: undefined as never },
    });
    return s;
  };

  it('reads the untouched old groundwater and vadose screens as unused', () => {
    const s = old();
    expect(screenUsed('transport', s)).toBe(false);
    expect(screenUsed('vadose', s)).toBe(false);
    expect(methodsRun(s).ids).toEqual([]);
  });

  it('reads an edited old screen as used', () => {
    const s = old();
    s.transport = { ...s.transport, form: { ...s.transport.form, rx: '150' } };
    s.vadose = { ...s.vadose, form: { ...s.vadose.form, durationYr: '77' } };
    expect(screenUsed('transport', s)).toBe(true);
    expect(screenUsed('vadose', s)).toBe(true);
  });
});

describe('methodsRun with feeds and chains', () => {
  it('counts a screen at its defaults as used when a feed sourced from it exists', () => {
    const r = methodsRun(base(), { well: { source: 'transport' } });
    expect(r.byScreen.transport).toContain('groundwater.at123d');
    expect(r.ids).toContain('groundwater.wexler1992');
  });

  it('a cleanup chain adds the methods the chain runs', () => {
    const s = base();
    s.cleanup = { form: { ...s.cleanup.form, source: 'dissolved' } };
    expect(methodsRun(s).ids).toEqual(
      expect.arrayContaining(['groundwater.at123d', 'groundwater.wexler1992']),
    );
    s.cleanup = { form: { ...s.cleanup.form, source: 'vadose' } };
    expect(methodsRun(s).ids).toEqual(
      expect.arrayContaining(['groundwater.at123d', 'vadose.vadsat', 'vadose.layered']),
    );
    s.cleanup = { form: { ...s.cleanup.form, source: 'saturated' } };
    const ids = methodsRun(s).ids;
    expect(ids).toEqual(
      expect.arrayContaining(['saturatedSource.two-region', 'saturatedSource.exponential']),
    );
    expect(ids).not.toContain('vadose.vadsat');
  });
});

describe('methodsRun', () => {
  it('is empty for a new project', () => {
    expect(methodsRun(base()).ids).toEqual([]);
  });

  it('every id it can return is a registered method', () => {
    const s = base();
    // Mark every screen used by editing one text field on each, then turn the optional methods on.
    s.transport = { ...s.transport, form: { ...s.transport.form, c0: '7.7', showDomenico: true } };
    s.vadose = { ...s.vadose, form: { ...s.vadose.form, foc: '0.0123' } } as Screens['vadose'];
    s.saturated = { ...s.saturated, method: 'modern' };
    s.vapor = { ...s.vapor, form: { ...s.vapor.form, source: 'groundwater' } };
    s.surfaceWater = {
      ...s.surfaceWater,
      form: { ...s.surfaceWater.form, volume: '3.3' },
    } as Screens['surfaceWater'];
    s.risk = { form: { ...s.risk.form, routeExtrapolation: true } } as Screens['risk'];
    s.cleanup = {
      form: {
        ...s.cleanup.form,
        source: 'dissolved',
        ssg: { ...s.cleanup.form.ssg, on: true },
      },
    };
    const r = methodsRun(s);
    expect(r.ids.length).toBeGreaterThan(10);
    for (const id of r.ids) expect(registry.has(id)).toBe(true);
    expect(new Set(r.ids).size).toBe(r.ids.length);
    expect(r.ids).toContain('groundwater.domenico1987');
    expect(r.ids).toContain('cleanup.ssg-leaching');
    expect(r.ids).toContain('cleanup.modeled-chains');
    expect(r.ids).toContain('vapor.attenuation-factor-2015');
  });

  it('a transport edit runs the two always-run methods and the chosen dispersivity law', () => {
    const s = base();
    s.transport = { ...s.transport, form: { ...s.transport.form, c0: '7.7', dispLaw: 'modern' } };
    const r = methodsRun(s);
    expect(r.byScreen.transport).toEqual([
      'groundwater.at123d',
      'groundwater.wexler1992',
      'dispersivity.xu-eckstein1995',
    ]);
    expect(r.ids).not.toContain('groundwater.domenico1987');
  });

  it('names the RISC5 regression only when it is chosen, not for an entered value or the SSG rule', () => {
    const ids = (dispLaw: 'entered' | 'ssg' | 'legacy') => {
      const s = base();
      s.transport = { ...s.transport, form: { ...s.transport.form, c0: '7.7', dispLaw } };
      return methodsRun(s).byScreen.transport;
    };
    const two = ['groundwater.at123d', 'groundwater.wexler1992'];
    expect(ids('entered')).toEqual(two);
    expect(ids('ssg')).toEqual(two);
    expect(ids('legacy')).toEqual([...two, 'dispersivity.gelhar1985-api1987']);
  });

  it('leaves the dispersivity law out when all three dispersivities are entered', () => {
    const s = base();
    s.transport = {
      ...s.transport,
      form: {
        ...s.transport.form,
        alphaLOverride: '1',
        alphaTOverride: '0.1',
        alphaVOverride: '0.01',
      },
    };
    expect(methodsRun(s).byScreen.transport).toEqual([
      'groundwater.at123d',
      'groundwater.wexler1992',
    ]);
  });

  it('omits the attenuation factor for a soil source on the vapor screen', () => {
    const s = base();
    s.vapor = { ...s.vapor, form: { ...s.vapor.form, source: 'soil', floorArea: '123' } };
    expect(methodsRun(s).ids).not.toContain('vapor.attenuation-factor-2015');
  });
});

describe('household, plants and uncertainty screens', () => {
  it('count as used only when edited, and every id they return is registered', () => {
    const s = base();
    expect(screenUsed('household', s)).toBe(false);
    s.household = { form: { ...s.household.form, soilConcentration: '3' } };
    s.plantsEco = {
      form: {
        ...s.plantsEco.form,
        soilConcentration: '3',
        benchmarks: [{ receptor: 'r', value: '1', citation: 'c' }],
        tphSet: 'madep',
        tphFractions: [
          { label: 'f', family: 'aliphatic', massFraction: '1', surrogate: '', level: '' },
        ],
      },
    };
    s.uncertainty = { ...s.uncertainty, risk: { ...s.uncertainty.risk, seed: 'x' } };
    const r = methodsRun(s);
    expect(Object.keys(r.byScreen)).toEqual(['household', 'plantsEco', 'uncertainty']);
    for (const id of r.ids) expect(registry.has(id)).toBe(true);
    expect(r.byScreen.plantsEco).toEqual([
      'plantUptake.trapp-matthies-1995',
      'plantUptake.hhrap-2005',
      'eco.ecossl-2005',
      'eco.benchmark-hq',
      'tph.madep',
    ]);
    expect(r.byScreen.uncertainty).toEqual(['uncertainty.srs-exposure']);
  });

  it('lists the probabilistic cleanup method for a run on the modeled-source panel', () => {
    const s = base();
    s.uncertainty = {
      ...s.uncertainty,
      modeled: {
        ...s.uncertainty.modeled,
        rows: {
          'groundwater.velocity': {
            kind: 'uniform',
            params: {},
            lnForm: 'geometric',
            lo: '1e-6',
            hi: '2e-6',
            table: '',
          },
        },
      },
    };
    const r = methodsRun(s);
    expect(r.byScreen.uncertainty).toEqual(['uncertainty.cleanup-probabilistic']);
  });

  it('a household feed marks the household screen used', () => {
    expect(
      methodsRun(base(), { household: { source: 'household' } }).byScreen.household,
    ).toHaveLength(7);
  });

  it('the RSL edition is named when the plants screen is used', () => {
    const s = base();
    s.plantsEco = { form: { ...s.plantsEco.form, soilConcentration: '3' } };
    expect(dataEditionsFor(methodsRun(s).byScreen).rsl).toBe('rsl-2024-11');
  });
});

describe('dataEditionsFor', () => {
  it('names the editions of the datasets the used screens read', () => {
    const s = base();
    s.risk = { form: { ...s.risk.form, routeExtrapolation: true } } as Screens['risk'];
    const e = dataEditionsFor(methodsRun(s).byScreen);
    expect(e.rsl).toBe('rsl-2024-11');
    expect(e.nrwqc).toBeUndefined();
  });

  it('a recorded edition in the project wins over the current one', () => {
    const s = base();
    s.risk = { form: { ...s.risk.form, routeExtrapolation: true } } as Screens['risk'];
    const e = dataEditionsFor(methodsRun(s).byScreen, { rsl: 'rsl-2023-01' });
    expect(e.rsl).toBe('rsl-2023-01');
  });
});
