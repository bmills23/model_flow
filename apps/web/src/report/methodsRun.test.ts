import { registry } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { defaultScreens, type Screens } from '../project';
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
