import { describe, expect, it } from 'vitest';
import { SITE_FIELDS } from '../report/siteValues';
import { applyTexture as vadoseTexture } from '../vadose/form';
import { applyTexture as vaporTexture } from '../vapor/form';
import {
  NON_VALUES,
  PROPERTY_FIELDS,
  PROPERTY_GROUPS,
  SOIL_TYPES,
  activeModels,
  blankTemplate,
  propertiesComplete,
  propertyView,
  setProperty,
  setSoilType,
  type PropertyFieldView,
  type PropertyView,
} from './propertyCatalog';
import { GUIDED_FORM_KEYS, TEMPLATE_STRIPPED, defaultGuided, type GuidedState } from './state';

type Form = Record<string, unknown>;

const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  patch(g);
  return g;
};

const wellSite = guidedWith((g) => {
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
});
const leachingWell = guidedWith((g) => {
  g.site.sources = ['soilAbove'];
  g.site.paths.leaching = true;
  g.site.paths.well = true;
});
const soilBelowWell = guidedWith((g) => {
  g.site.sources = ['soilBelow'];
  g.site.paths.well = true;
});
const leachingBuilding = guidedWith((g) => {
  g.site.sources = ['soilAbove'];
  g.site.paths.leaching = true;
  g.site.paths.building = true;
});
const soilGasBuilding = guidedWith((g) => {
  g.site.sources = ['soilGas'];
  g.site.paths.building = true;
});

const groupIds = (v: PropertyView): string[] => v.groups.map((x) => x.id);
const fieldOf = (v: PropertyView, id: string): PropertyFieldView | undefined =>
  v.groups.flatMap((x) => x.fields).find((f) => f.field.id === id);
const form = (g: GuidedState, model: keyof GuidedState['forms']): Form =>
  g.forms[model] as unknown as Form;

/** Every needed value set to a number, the way a person would fill the step. */
function fillNeeded(g: GuidedState): GuidedState {
  let next = g;
  for (const f of propertyView(next).groups.flatMap((x) => x.fields)) {
    if (f.items === null) {
      if (f.needed) next = setProperty(next, f.field.id, '1');
    } else {
      for (const item of f.items) {
        if (item.tag === 'needed') next = setProperty(next, f.field.id, '1', item.index);
      }
    }
  }
  return next;
}

describe('the property catalog', () => {
  it('holds every site field of each model, or names it as a value another step sets', () => {
    const missing: string[] = [];
    const both: string[] = [];
    const unknown: string[] = [];
    for (const model of GUIDED_FORM_KEYS) {
      const site = (SITE_FIELDS[model] ?? []).map((f) => f.key);
      const bound = new Set(
        PROPERTY_FIELDS.flatMap((f) => f.bindings.filter((b) => b.model === model)).map(
          (b) => b.key,
        ),
      );
      const named = new Set(Object.keys(NON_VALUES[model]));
      for (const key of site) {
        if (!bound.has(key) && !named.has(key)) missing.push(`${model}: ${key}`);
        if (bound.has(key) && named.has(key)) both.push(`${model}: ${key}`);
      }
      for (const key of [...bound, ...named]) {
        if (!site.includes(key)) unknown.push(`${model}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(both).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('gives every named non-value a plain reason and every field a group, a label and no long dash', () => {
    const groups = new Set(PROPERTY_GROUPS.map((g) => g.id));
    for (const f of PROPERTY_FIELDS) {
      expect(groups.has(f.group), f.id).toBe(true);
      expect(f.label.length).toBeGreaterThan(3);
      expect(f.label).not.toContain('—');
      expect(f.bindings.length).toBeGreaterThan(0);
    }
    for (const model of GUIDED_FORM_KEYS) {
      for (const reason of Object.values(NON_VALUES[model])) {
        expect(reason).toMatch(/step 3[bcd]|step [45]|run/i);
        expect(reason).not.toContain('—');
      }
    }
    expect(new Set(PROPERTY_FIELDS.map((f) => f.id)).size).toBe(PROPERTY_FIELDS.length);
    for (const s of SOIL_TYPES) expect(groups.has(s.group)).toBe(true);
  });

  it('starts each template from the screen default without the chemical and source fields', () => {
    for (const model of GUIDED_FORM_KEYS) {
      const t = blankTemplate(model) as unknown as Form;
      for (const k of TEMPLATE_STRIPPED[model]) expect(k in t, `${model}.${k}`).toBe(false);
    }
    // the transport retardation comes from each chemical's Kd, so the template reads foc and bulk density
    expect((blankTemplate('transport') as unknown as Form)['retardMode']).toBe('kd');
  });
});

describe('groups follow the chain', () => {
  it('shows nothing while step 2 has a problem or the values are measured', () => {
    expect(propertyView(defaultGuided()).groups).toEqual([]);
    const measured = guidedWith((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['groundwater'];
    });
    expect(activeModels(measured)).toEqual([]);
    expect(propertyView(measured).groups).toEqual([]);
    expect(propertiesComplete(measured)).toBe(true);
    expect(propertiesComplete(defaultGuided())).toBe(false);
  });

  it('a groundwater well shows the source area, the aquifer and the household water use', () => {
    const v = propertyView(wellSite);
    expect(groupIds(v)).toEqual(['source', 'aquifer', 'household']);
    expect(fieldOf(v, 'infiltration')).toBeUndefined();
  });

  it('leaching to a well adds the unsaturated zone; soil below the water table adds its soil', () => {
    expect(groupIds(propertyView(leachingWell))).toEqual([
      'source',
      'unsaturated',
      'aquifer',
      'household',
    ]);
    expect(groupIds(propertyView(soilBelowWell))).toEqual([
      'source',
      'saturatedSoil',
      'aquifer',
      'household',
    ]);
  });

  it('a building from soil gas shows the unsaturated zone and the building only', () => {
    expect(groupIds(propertyView(soilGasBuilding))).toEqual(['unsaturated', 'building']);
  });

  it('a stream adds the water body, and produce from soil adds the produce group', () => {
    const stream = guidedWith((g) => {
      g.site.sources = ['groundwater'];
      g.site.paths.stream = true;
    });
    expect(groupIds(propertyView(stream))).toContain('water');
    const produce = guidedWith((g) => {
      g.site.sources = ['soilAbove'];
      g.site.paths.leaching = true;
      g.site.produce = 'soil';
    });
    expect(groupIds(propertyView(produce))).toContain('produce');
  });

  it('shows the oxygen-limited values only when step 2 chose that indoor air method', () => {
    expect(fieldOf(propertyView(soilGasBuilding), 'dvDa')).toBeUndefined();
    const oxygen = guidedWith((g) => {
      g.site.sources = ['soilGas'];
      g.site.paths.building = true;
      g.site.indoorModel = 'oxygenLimited';
    });
    expect(fieldOf(propertyView(oxygen), 'dvDa')?.needed).toBe(true);
  });
});

describe('a shared field', () => {
  it('writes every form it stands for among the chosen models', () => {
    const g = setProperty(soilBelowWell, 'srcLength', '25');
    expect(form(g, 'transport')['srcLength']).toBe('25');
    expect(form(g, 'saturated')['srcLength']).toBe('25');
    expect(g.forms.vadose).toBeUndefined();
    const h = setProperty(leachingWell, 'srcLength', '12');
    expect(form(h, 'transport')['srcLength']).toBe('12');
    expect(form(h, 'vadose')['srcLength']).toBe('12');
    expect(fieldOf(propertyView(h), 'srcLength')).toMatchObject({
      value: '12',
      mixed: false,
      tag: 'entered',
    });
  });

  it('writes every layer of every soil column it stands for, and says when they differ', () => {
    const g = setProperty(leachingBuilding, 'porosity', '0.4');
    const vadose = form(g, 'vadose') as { source: Form; above: Form[]; below: Form[] };
    expect(vadose.source['thetaS']).toBe('0.4');
    expect(vadose.above.map((l) => l['thetaS'])).toEqual(vadose.above.map(() => '0.4'));
    expect(vadose.below.map((l) => l['thetaS'])).toEqual(vadose.below.map(() => '0.4'));
    const vapor = form(g, 'vapor') as { layers: Form[] };
    expect(vapor.layers.map((l) => l['porosity'])).toEqual(vapor.layers.map(() => '0.4'));
    expect(fieldOf(propertyView(g), 'porosity')?.mixed).toBe(false);
    // the leaching template's default lens has its own residual water content
    expect(fieldOf(propertyView(g), 'thetaR')?.mixed).toBe(true);
    const h = setProperty(g, 'thetaR', '0.05');
    expect(fieldOf(propertyView(h), 'thetaR')).toMatchObject({ mixed: false, value: '0.05' });
  });

  it('writes one entry of a layer list for a thickness', () => {
    const g = setProperty(leachingWell, 'vadoseAboveThickness', '2.5', 1);
    const vadose = form(g, 'vadose') as { above: Form[] };
    expect(vadose.above[1]!['thickness']).toBe('2.5');
    expect(vadose.above[0]!['thickness']).toBe(
      (blankTemplate('vadose') as unknown as { above: Form[] }).above[0]!['thickness'],
    );
    const items = fieldOf(propertyView(g), 'vadoseAboveThickness')?.items ?? [];
    expect(items.map((i) => i.tag)).toEqual(['default', 'entered']);
    expect(items[0]!.label).toMatch(/layer 1 above the source, thickness/i);
  });
});

describe('the soil type', () => {
  it('fills every layer of the unsaturated zone and tags the values it filled', () => {
    const g = setSoilType(leachingBuilding, 'unsaturated', 'SL');
    const vadose = form(g, 'vadose') as { source: Form; above: Form[] };
    expect(vadose.source).toEqual(vadoseTexture(blankTemplate('vadose').source, 'SL'));
    const vapor = form(g, 'vapor') as { layers: Form[] };
    expect(vapor.layers[0]).toEqual(vaporTexture(blankTemplate('vapor').layers[0]!, 'SL'));
    const v = propertyView(g);
    const unsat = v.groups.find((x) => x.id === 'unsaturated')!;
    expect(unsat.soilType).toMatchObject({ value: 'SL' });
    expect(fieldOf(v, 'porosity')?.tag).toBe('soilType');
    expect(fieldOf(v, 'thetaR')).toMatchObject({ tag: 'soilType', mixed: false });
    // organic carbon is the site's own: the soil type leaves it as it was
    expect(fieldOf(v, 'foc')?.tag).toBe('default');
    // a value changed after the fill is the person's
    const h = setProperty(g, 'porosity', '0.3');
    expect(fieldOf(propertyView(h), 'porosity')?.tag).toBe('entered');
  });

  it('fills the soil below the water table from its own soil type', () => {
    const g = setSoilType(soilBelowWell, 'saturated', 'SL');
    expect(form(g, 'saturated')['texture']).toBe('SL');
    const v = propertyView(g);
    expect(fieldOf(v, 'satPorosity')?.tag).toBe('soilType');
    expect(fieldOf(v, 'satFoc')?.tag).toBe('default');
  });

  it('reads as differing when the layers have different soil types', () => {
    const g = setSoilType(leachingBuilding, 'unsaturated', 'SL');
    const vapor = form(g, 'vapor') as { layers: Form[] };
    vapor.layers[0] = { ...vapor.layers[0], texture: 'C' };
    const unsat = propertyView(g).groups.find((x) => x.id === 'unsaturated')!;
    expect(unsat.soilType).toMatchObject({ value: '' });
  });
});

describe('needed marks', () => {
  it('marks a value a chosen model needs but nobody entered, and counts them', () => {
    const v = propertyView(wellSite);
    expect(fieldOf(v, 'alphaL')).toMatchObject({ needed: true, tag: 'needed' });
    expect(fieldOf(v, 'showerFlow')).toMatchObject({ needed: true, tag: 'needed' });
    // an optional blank is not needed
    expect(fieldOf(v, 'aquiferWidth')).toBeUndefined(); // used only for a finite aquifer
    expect(fieldOf(v, 'filmGas')).toMatchObject({ needed: false, tag: 'optional' });
    expect(v.needed).toBeGreaterThan(0);
    const g = setProperty(wellSite, 'alphaL', '10');
    expect(fieldOf(propertyView(g), 'alphaL')).toMatchObject({ needed: false, tag: 'entered' });
    expect(propertyView(g).needed).toBe(v.needed - 1);
  });

  it('is complete once every needed value is entered', () => {
    // the building's template starts with a value in every field it needs
    expect(propertiesComplete(soilGasBuilding)).toBe(true);
    for (const site of [wellSite, leachingWell, soilBelowWell, leachingBuilding, soilGasBuilding]) {
      if (site !== soilGasBuilding) expect(propertiesComplete(site)).toBe(false);
      const filled = fillNeeded(site);
      expect(propertyView(filled).needed).toBe(0);
      expect(propertiesComplete(filled)).toBe(true);
    }
  });

  it('keeps the other parts of the guided state as they were', () => {
    const before = guidedWith((g) => {
      g.site.sources = ['groundwater'];
      g.site.paths.well = true;
      g.run.timeYr = '50';
    });
    const after = setProperty(before, 'rx', '200');
    expect(after.run).toEqual(before.run);
    expect(after.site).toEqual(before.site);
    expect(before.forms.transport).toBeUndefined();
  });
});
