// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { compareToCriteria } from '@model-flow/engine';
import {
  criteriaFor,
  loadCriteriaDb,
  searchCriteriaChemicals,
  type CriteriaDb,
} from './criteriaDb';
import { loadCriteriaDbFor } from './criteriaSets';
import { CRITERIA_SET_CHOICES, type CriteriaSetChoice } from './criteriaSetChoice';

const dbs = new Map<CriteriaSetChoice, CriteriaDb>();
beforeAll(async () => {
  for (const c of CRITERIA_SET_CHOICES) dbs.set(c, await loadCriteriaDbFor(c));
}, 60000);

const db = (c: CriteriaSetChoice): CriteriaDb => dbs.get(c)!;
const BENZENE = '71-43-2';

describe('loadCriteriaDbFor', () => {
  it('gives the US sets as the default, the same database the cleanup screens use', async () => {
    expect(await loadCriteriaDbFor('us')).toBe(await loadCriteriaDb());
    expect(db('us').set).toBe('us');
  });

  it('keeps the international rows out of the US database that other screens read', () => {
    const us = db('us');
    expect(us.criteria.every((c) => !c.id.startsWith('ccme:') && !c.id.startsWith('eu:'))).toBe(
      true,
    );
  });

  it('gives every criterion of every choice a basis, a medium and a source to show', () => {
    for (const c of CRITERIA_SET_CHOICES) {
      const d = db(c);
      expect(d.criteria.length, c).toBeGreaterThan(40);
      for (const k of d.criteria) {
        const info = d.info.get(k.id);
        expect(info, `${c} ${k.id}`).toBeDefined();
        expect(info!.basis.length, k.id).toBeGreaterThan(0);
        expect(info!.source.length, k.id).toBeGreaterThan(0);
        expect(info!.setLabel.length, k.id).toBeGreaterThan(0);
        expect(info!.medium).toBe(k.medium);
      }
      expect(new Set(d.criteria.map((k) => k.id)).size, `${c} ids`).toBe(d.criteria.length);
    }
  });

  it('holds only the rows of the chosen set', () => {
    for (const id of ['ccme', 'eu', 'uk', 'anzg', 'macdonald2000'] as const) {
      for (const k of db(id).criteria) expect(db(id).info.get(k.id)?.set, k.id).toBe(id);
    }
  });

  it('records the media each set has: EU, UK and ANZG are water only, MacDonald is sediment only', () => {
    const media = (c: CriteriaSetChoice) => new Set(db(c).criteria.map((k) => k.medium));
    expect([...media('eu')]).toEqual(['surfaceWater']);
    expect([...media('uk')]).toEqual(['surfaceWater']);
    expect([...media('anzg')]).toEqual(['surfaceWater']);
    expect([...media('macdonald2000')]).toEqual(['sediment']);
    expect(media('ccme')).toEqual(new Set(['surfaceWater', 'sediment']));
    expect(db('macdonald2000').media).toEqual(['sediment']);
  });

  it('describes the US criteria by their basis, medium and source table too', () => {
    const us = db('us');
    const acute = criteriaFor(us, '7440-66-6', 'surfaceWater').find(
      (k) => k.endpoint === 'aquatic-saltwater-acute',
    )!;
    expect(us.info.get(acute.id)).toMatchObject({
      set: 'us',
      medium: 'surfaceWater',
      waterType: 'salt',
    });
    expect(us.info.get(acute.id)!.basis).toMatch(/acute/i);
    expect(us.info.get(acute.id)!.source).toMatch(/aquatic life/i);
    const sed = criteriaFor(us, '7440-38-2', 'sediment')[0]!;
    expect(us.info.get(sed.id)!.source).toMatch(/Table 2a/);
    expect(us.info.get(sed.id)!.source).toMatch(/p\. 81/);
  });
});

describe('the Canadian set', () => {
  it('compares the peak with the benzene long-term guideline and says where it came from', () => {
    const criteria = criteriaFor(db('ccme'), BENZENE, 'surfaceWater');
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: BENZENE,
      series: [740e-6],
      criteria,
      waterType: 'fresh',
    });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.ratio).toBeCloseTo(2, 9);
    expect(r.results[0]!.exceeds).toBe(true);
    const info = db('ccme').info.get(r.results[0]!.criterion!.id)!;
    expect(info.basis).toMatch(/long-term/);
    expect(info.setLabel).toMatch(/CCME/);
    expect(info.source).toMatch(/CCME summary table/);
    expect(info.waterType).toBe('fresh');
  });

  it('reports a cadmium guideline printed as an equation as site-specific, not as a number', () => {
    const criteria = criteriaFor(db('ccme'), '7440-43-9', 'surfaceWater');
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-43-9',
      series: [1e-6],
      criteria,
      waterType: 'fresh',
    });
    expect(r.results.every((x) => x.status === 'site-specific')).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('criteria.site-specific');
  });

  it('compares sediment on dry weight with ug/kg converted to SI', () => {
    const criteria = criteriaFor(db('ccme'), '50-32-8', 'sediment');
    const r = compareToCriteria({
      medium: 'sediment',
      chemicalId: '50-32-8',
      series: [31.9e-9],
      criteria,
      waterType: 'fresh',
    });
    const isqg = r.results.find((x) => x.criterion?.endpoint.endsWith('isqg'))!;
    expect(isqg.ratio).toBeCloseTo(1, 9);
    expect(isqg.exceeds).toBe(false);
  });
});

describe('the European, British and Australian sets', () => {
  it('keeps the EU annual average and maximum allowable concentration apart, per water type', () => {
    const criteria = criteriaFor(db('eu'), '15972-60-8', 'surfaceWater');
    const fresh = criteria.filter((k) => k.waterType === 'fresh');
    expect(fresh.map((k) => db('eu').info.get(k.id)!.basis).sort()).toEqual([
      'annual average (AA-EQS), inland',
      'maximum allowable concentration (MAC-EQS), inland',
    ]);
  });

  it('shows the ANZG protection level as the basis of each value', () => {
    const criteria = criteriaFor(db('anzg'), '71-55-6', 'surfaceWater').filter(
      (k) => k.waterType === 'fresh',
    );
    const bases = criteria.map((k) => db('anzg').info.get(k.id)!.basis);
    expect(bases.some((b) => b.startsWith('95 percent species protection'))).toBe(true);
    expect(bases.some((b) => b.startsWith('99 percent species protection'))).toBe(true);
  });
});

describe('the MacDonald consensus guidelines', () => {
  it('joins by name to the Region 4 chemical, so one search finds the benchmarks of both', () => {
    const arsenic = searchCriteriaChemicals(db('all'), '7440-38-2')[0]!;
    const sets = new Set(
      (db('all').byChemical.get(arsenic.id) ?? [])
        .filter((k) => k.medium === 'sediment')
        .map((k) => db('all').info.get(k.id)!.set),
    );
    expect(sets.has('us')).toBe(true);
    expect(sets.has('macdonald2000')).toBe(true);
    expect(sets.has('ccme')).toBe(true);
  });

  it('compares a sediment peak with the TEC and the PEC', () => {
    const criteria = criteriaFor(db('macdonald2000'), '7440-38-2', 'sediment');
    const r = compareToCriteria({
      medium: 'sediment',
      chemicalId: '7440-38-2',
      series: [20e-6],
      criteria,
      waterType: 'fresh',
    });
    const byBasis = (b: string) =>
      r.results.find((x) => db('macdonald2000').info.get(x.criterion!.id)!.basis.includes(b))!;
    expect(byBasis('TEC').exceeds).toBe(true);
    expect(byBasis('PEC').exceeds).toBe(false);
  });
});

describe('the union of all sets', () => {
  it('has the criteria of every set for one chemical, each with its own set label', () => {
    const all = db('all');
    const zinc = (all.byChemical.get('7440-66-6') ?? []).map((k) => all.info.get(k.id)!.set);
    for (const s of ['us', 'ccme', 'uk', 'anzg', 'macdonald2000']) expect(zinc).toContain(s);
  });

  it('keeps the peak rule and the per-criterion ratios: one result per criterion, never summed', () => {
    const all = db('all');
    const criteria = criteriaFor(all, BENZENE, 'surfaceWater');
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: BENZENE,
      series: [1e-6, 5e-6, 2e-6],
      criteria,
    });
    expect(r.concentration).toBe(5e-6);
    expect(r.results).toHaveLength(criteria.length);
  });

  it('lists a chemical once, by CAS number, however many sets name it', () => {
    const all = db('all');
    const ids = all.chemicals.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
