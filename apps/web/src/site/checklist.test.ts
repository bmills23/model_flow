import { describe, expect, it } from 'vitest';
import { checklist } from './checklist';
import {
  DIRECT_MEDIA,
  MODELED_SOURCES,
  defaultSite,
  type Basis,
  type ReceptorKind,
  type SiteState,
  type SourceMedium,
} from './model';

const site = (over: Partial<SiteState>): SiteState => ({ ...defaultSite(), ...over });

// The screens each valid (receptors, basis, medium) walks through, before the produce extras.
const FATE: Record<string, string[]> = {
  'human/direct/soil': ['chemicals', 'risk', 'cleanup', 'report'],
  'human/direct/groundwater': ['chemicals', 'risk', 'cleanup', 'report'],
  'human/direct/surfaceWater': ['chemicals', 'risk', 'cleanup', 'report'],
  'human/direct/indoorAir': ['chemicals', 'risk', 'cleanup', 'report'],
  'human/direct/outdoorAir': ['chemicals', 'risk', 'cleanup', 'report'],
  'human/modeled/soil': ['chemicals', 'vadose', 'transport', 'risk', 'cleanup', 'report'],
  'human/modeled/groundwater': ['chemicals', 'transport', 'risk', 'cleanup', 'report'],
  'human/modeled/soilToIndoorAir': ['chemicals', 'vadose', 'vapor', 'risk', 'cleanup', 'report'],
  'human/modeled/soilGasToIndoorAir': ['chemicals', 'vapor', 'risk', 'cleanup', 'report'],
  'ecological/direct/soil': ['chemicals', 'plants-eco', 'report'],
  'ecological/direct/groundwater': ['chemicals', 'plants-eco', 'report'],
  'ecological/direct/surfaceWater': ['chemicals', 'plants-eco', 'surface-water', 'report'],
  'ecological/direct/indoorAir': ['chemicals', 'plants-eco', 'report'],
  'ecological/direct/outdoorAir': ['chemicals', 'plants-eco', 'report'],
  'ecological/modeled/soil': ['chemicals', 'vadose', 'transport', 'plants-eco', 'report'],
  'ecological/modeled/groundwater': ['chemicals', 'transport', 'plants-eco', 'report'],
  'ecological/modeled/soilToIndoorAir': ['chemicals', 'vadose', 'vapor', 'plants-eco', 'report'],
  'ecological/modeled/soilGasToIndoorAir': ['chemicals', 'vapor', 'plants-eco', 'report'],
};

const mediaOf = (b: Basis): readonly SourceMedium[] =>
  b === 'direct' ? DIRECT_MEDIA : MODELED_SOURCES;

describe('checklist: every valid combination', () => {
  const kinds: ReceptorKind[] = ['human', 'ecological'];
  for (const receptors of kinds)
    for (const basis of ['direct', 'modeled'] as const)
      for (const m of mediaOf(basis))
        for (const location of ['onsite', 'downgradient'] as const)
          for (const vaporMethod of ['legacy', 'modern'] as const)
            for (const produce of ['none', 'soil', 'irrigation'] as const) {
              const produceSoil = produce === 'soil';
              const produceIrrigation = produce === 'irrigation';
              const s = site({
                receptors,
                basis,
                media: [m],
                location,
                vaporMethod,
                produceSoil,
                produceIrrigation,
              });
              const name = `${receptors}/${basis}/${m} ${location} ${vaporMethod} produce:${produce}`;
              it(name, () => {
                const base = FATE[`${receptors}/${basis}/${m}`]!;
                const c = checklist(s);
                // produce needs its own medium for a human; a mismatch is a problem, not a checklist
                const mismatch =
                  receptors === 'human' &&
                  ((produceSoil && m !== 'soil') || (produceIrrigation && m !== 'groundwater'));
                if (mismatch) {
                  expect(c.problems.map((p) => p.id)).toEqual([
                    produceSoil
                      ? 'produce-soil-needs-soil'
                      : 'produce-irrigation-needs-groundwater',
                  ]);
                  expect(c.items).toEqual([]);
                  return;
                }
                expect(c.problems).toEqual([]);
                const extra =
                  receptors === 'human' && produceSoil
                    ? ['plants-eco']
                    : receptors === 'human' && produceIrrigation
                      ? ['household']
                      : [];
                const at = base.indexOf('risk');
                const expected =
                  extra.length === 0 ? base : [...base.slice(0, at), ...extra, ...base.slice(at)];
                expect(c.items.map((i) => i.id)).toEqual(expected);
                for (const it of c.items) {
                  expect(it.href).toMatch(/^#\/[a-z-]+$/);
                  expect(it.action.length).toBeGreaterThan(0);
                }
              });
            }
});

describe('checklist: invalid combinations are explained, not allowed', () => {
  it('explains two source media and gives no checklist', () => {
    const c = checklist(site({ media: ['soil', 'groundwater'] }));
    expect(c.problems.map((p) => p.id)).toEqual(['two-media']);
    expect(c.problems[0]!.message).toMatch(/one source medium/i);
    expect(c.items).toEqual([]);
  });

  it('prefers soil gas when soil and soil gas are both ticked', () => {
    const c = checklist(
      site({ basis: 'modeled', media: ['soilToIndoorAir', 'soilGasToIndoorAir'] }),
    );
    expect(c.problems.map((p) => p.id)).toEqual(['two-media']);
    expect(c.problems[0]!.message).toMatch(/soil gas/i);
  });

  it('asks for a medium when none is ticked', () => {
    const c = checklist(site({ media: [] }));
    expect(c.problems.map((p) => p.id)).toEqual(['no-medium']);
    expect(c.items).toEqual([]);
  });

  it('refuses produce from soil and from irrigation water together', () => {
    const c = checklist(site({ produceSoil: true, produceIrrigation: true }));
    expect(c.problems.map((p) => p.id)).toContain('produce-both');
    expect(c.items).toEqual([]);
  });

  it('reports every problem at once', () => {
    const c = checklist(site({ media: [], produceSoil: true, produceIrrigation: true }));
    expect(c.problems.map((p) => p.id).sort()).toEqual(['no-medium', 'produce-both']);
  });
});

describe('checklist: items and notes', () => {
  it('names the feed button to press on each fate screen', () => {
    const c = checklist(site({ basis: 'modeled', media: ['soil'] }));
    expect(c.items.find((i) => i.id === 'vadose')?.feed).toBe('Use as groundwater source');
    expect(c.items.find((i) => i.id === 'transport')?.feed).toBe(
      'Use as exposure well concentration',
    );
    const v = checklist(site({ basis: 'modeled', media: ['soilToIndoorAir'] }));
    expect(v.items.find((i) => i.id === 'vadose')?.feed).toBe('Use as vapor source');
    expect(v.items.find((i) => i.id === 'vapor')?.feed).toBe('Send to exposure and risk');
  });

  it('carries the chosen vapor method into the vapor step', () => {
    const legacy = checklist(
      site({ basis: 'modeled', media: ['soilGasToIndoorAir'], vaporMethod: 'legacy' }),
    );
    expect(legacy.items.find((i) => i.id === 'vapor')?.action).toMatch(/legacy/i);
    const modern = checklist(site({ basis: 'modeled', media: ['soilGasToIndoorAir'] }));
    expect(modern.items.find((i) => i.id === 'vapor')?.action).toMatch(/modern/i);
  });

  it('tells the transport step where the exposure point is', () => {
    const on = checklist(site({ basis: 'modeled', media: ['groundwater'] }));
    const down = checklist(
      site({ basis: 'modeled', media: ['groundwater'], location: 'downgradient' }),
    );
    expect(on.items.find((i) => i.id === 'transport')?.action).toMatch(/source area/i);
    expect(down.items.find((i) => i.id === 'transport')?.action).toMatch(/downgradient/i);
  });

  it('notes that location does not change a measured concentration', () => {
    const c = checklist(site({ location: 'downgradient' }));
    expect(c.notes.join(' ')).toMatch(/measured/i);
  });

  it('notes that produce does not apply to ecological receptors', () => {
    const c = checklist(site({ receptors: 'ecological', produceSoil: true }));
    expect(c.problems).toEqual([]);
    expect(c.notes.join(' ')).toMatch(/produce/i);
  });

  it('every step label is one of the six steps', () => {
    const labels = new Set([
      'Chemicals',
      'Site model',
      'Transport',
      'Receptors',
      'Risk & cleanup',
      'Results',
    ]);
    for (const key of Object.keys(FATE)) {
      const [r, b, m] = key.split('/') as [ReceptorKind, Basis, SourceMedium];
      for (const i of checklist(site({ receptors: r, basis: b, media: [m] })).items)
        expect(labels.has(i.step), i.id).toBe(true);
    }
  });
});
