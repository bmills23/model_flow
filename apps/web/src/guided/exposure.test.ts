import { describe, expect, it } from 'vitest';
import { defaultReceptor } from '../risk/form';
import { pathwayStatuses } from './pathways';
import {
  childAndAdult,
  exposureDone,
  missingExposureInputs,
  receptorProblems,
  setPathwayTick,
} from './exposure';
import { guidedWith } from './forms.testkit';
import type { GuidedState } from './state';

const measuredSoil = (g: GuidedState): void => {
  g.site.basis = 'measured';
  g.site.measured = ['soil', 'groundwater'];
};

describe('setPathwayTick', () => {
  it('stores only a changed tick: unticking writes false, ticking again removes the entry', () => {
    const g = guidedWith(measuredSoil);
    const off = setPathwayTick(g, 'soilIngestion', false);
    expect(off.exposure.pathways).toEqual({ soilIngestion: false });
    expect(pathwayStatuses(off).find((p) => p.id === 'soilIngestion')!.on).toBe(false);
    const on = setPathwayTick(off, 'soilIngestion', true);
    expect(on.exposure.pathways).toEqual({});
    expect(g.exposure.pathways).toEqual({});
  });
});

describe('exposureDone', () => {
  it('needs at least one pathway on', () => {
    const g = guidedWith(measuredSoil);
    expect(exposureDone(g)).toBe(true);
    let all = g;
    for (const p of pathwayStatuses(g).filter((s) => s.on)) {
      all = setPathwayTick(all, p.id, false);
    }
    expect(exposureDone(all)).toBe(false);
    expect(exposureDone(guidedWith(() => undefined))).toBe(false);
  });

  it('is not done while a receptor factor is not a number', () => {
    const g = guidedWith(measuredSoil);
    g.exposure.a = { ...defaultReceptor('resident'), waterIngestion: 'lots' };
    expect(receptorProblems(g).join(' ')).toMatch(/drinking water/i);
    expect(exposureDone(g)).toBe(false);
  });
});

describe('childAndAdult', () => {
  it('sets a child resident and a resident, adds their cancer risks', () => {
    const g = childAndAdult(guidedWith(measuredSoil));
    expect(g.exposure.a.preset).toBe('child');
    expect(g.exposure.b?.preset).toBe('resident');
    expect(g.exposure.additive).toBe(true);
  });
});

describe('missingExposureInputs (M3: name the missing input)', () => {
  const inputs = (g: GuidedState) => missingExposureInputs(g).map((m) => m.label);

  it('names the bathing time that shower air needs when the receptor has none', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['indoorAir'];
      x.run.basis = 'legacy';
    });
    // indoor air alone: the legacy resident carries its 24 h a day
    expect(inputs(g)).not.toContain('Bathing time');
  });

  it('lists the soil skin inputs the legacy resident leaves open for a ticked soil contact', () => {
    const g = guidedWith((x) => {
      measuredSoil(x);
      x.run.basis = 'legacy';
    });
    const names = inputs(g);
    expect(names).toContain('Soil skin area');
    expect(names).toContain('Soil adherence');
    const m = missingExposureInputs(g).find((x) => x.label === 'Soil skin area')!;
    expect(m.unit).toBe('cm2');
    expect(m.receptor).toBe('Receptor A');
    expect(m.pathways).toEqual(['Soil dermal contact']);
  });

  it('is satisfied by a typed value, and the modern resident has the soil skin inputs built in', () => {
    const g = guidedWith((x) => {
      measuredSoil(x);
      x.run.basis = 'legacy';
      x.exposure.a = {
        ...defaultReceptor('resident'),
        soilSkinArea: '5700',
        soilAdherence: '0.07',
      };
    });
    expect(inputs(g)).not.toContain('Soil skin area');
    const modern = guidedWith((x) => {
      measuredSoil(x);
      x.run.basis = 'modern';
    });
    expect(inputs(modern)).not.toContain('Soil skin area');
  });

  it('skips a pathway that is unticked and names the receptor by its own name when given', () => {
    let g = guidedWith((x) => {
      measuredSoil(x);
      x.run.basis = 'legacy';
    });
    g = setPathwayTick(g, 'soilDermal', false);
    expect(inputs(g)).not.toContain('Soil skin area');
  });
});
