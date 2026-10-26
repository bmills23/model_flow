import { describe, expect, it } from 'vitest';
import { vaporCoefficients } from './coefficients';
import { runVapor } from './compute';
import { DEFAULT_FORM, applyTexture, toInputs, type VaporForm } from './form';
import { DEFAULT_OUTDOOR } from './outdoor';
import { VAPOR_METHOD_WORDS, vaporRunInputs } from './runInputs';
import { buildVaporRiskFeed } from './sendBuild';
import { constantEpcs, vaporEpcs, type MethodKey, type SourceSeries } from './series';

// a groundwater source needs the capillary zone, so the deepest stratum takes a texture class
const form: VaporForm = {
  ...DEFAULT_FORM,
  chemicalId: '71-43-2',
  source: 'groundwater',
  layers: DEFAULT_FORM.layers.map((l, i, all) => (i === all.length - 1 ? applyTexture(l, 'S') : l)),
};
const parsedOf = (f: VaporForm) => {
  const p = toInputs(f);
  if (!p.ok) throw new Error('form');
  return p;
};
const chemical = { id: '71-43-2', name: 'Benzene' };
const source: SourceSeries = {
  kind: 'groundwater',
  label: 'Water table under the building',
  series: { times: [0, 3.15e8, 6.3e8], values: [1e-5, 8e-6, 3e-6] },
};

// the send the screen made inline before the builder existed
function oldSend(method: MethodKey, active: SourceSeries | null) {
  const parsed = parsedOf(form);
  const shown = runVapor(parsed);
  const feedEpcs = active ? vaporEpcs(form, parsed, active, DEFAULT_OUTDOOR) : null;
  const r = feedEpcs ?? constantEpcs(form, parsed, shown, DEFAULT_OUTDOOR, method);
  const indoor = r.indoor[method];
  if (!indoor) return null;
  const outdoorSpec = method === 'devaull' ? undefined : r.outdoor[method];
  const coefficients = vaporCoefficients(
    form,
    parsed,
    feedEpcs ? active : null,
    DEFAULT_OUTDOOR,
    method,
  );
  return {
    chemicalId: chemical.id,
    label: `${chemical.name}, ${VAPOR_METHOD_WORDS[method]}${active ? `, ${active.label}` : ', entered source'}`,
    indoor,
    ...(outdoorSpec ? { outdoor: outdoorSpec } : {}),
    coefficients: {
      ...(coefficients.indoor ? { indoor: coefficients.indoor } : {}),
      ...(outdoorSpec && coefficients.outdoor ? { outdoor: coefficients.outdoor } : {}),
    },
    runInputs: vaporRunInputs({
      form,
      outdoor: DEFAULT_OUTDOOR,
      method,
      fedBy: active ? active.label : null,
      withOutdoor: outdoorSpec !== undefined,
    }),
  };
}

function build(method: MethodKey, active: SourceSeries | null, over = {}) {
  const parsed = parsedOf(form);
  return buildVaporRiskFeed({
    form,
    formValid: true,
    shownParsed: parsed,
    shown: runVapor(parsed),
    outdoorForm: DEFAULT_OUTDOOR,
    method,
    chemical,
    refusedChoice: false,
    active,
    feedEpcs: active ? vaporEpcs(form, parsed, active, DEFAULT_OUTDOOR) : null,
    ...over,
  });
}

describe('buildVaporRiskFeed', () => {
  for (const method of ['legacy', 'modern'] as const) {
    it(`equals the screen's send for the entered source, ${method}`, () => {
      const feed = build(method, null);
      expect(feed).not.toBeNull();
      expect(feed).toEqual(oldSend(method, null));
    });
    it(`equals the screen's send for a fed source series, ${method}`, () => {
      const feed = build(method, source);
      expect(feed).not.toBeNull();
      expect(feed).toEqual(oldSend(method, source));
    });
  }

  it('sends nothing where the screen sends nothing', () => {
    expect(build('legacy', null, { formValid: false })).toBeNull();
    expect(build('legacy', null, { chemical: null })).toBeNull();
    expect(build('legacy', null, { refusedChoice: true })).toBeNull();
    expect(build('legacy', null, { shown: null })).toBeNull();
    expect(build('legacy', null, { shownParsed: null })).toBeNull();
  });
});
