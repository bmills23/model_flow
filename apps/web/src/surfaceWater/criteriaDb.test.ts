import { beforeAll, describe, expect, it } from 'vitest';
import { compareToCriteria } from '@model-flow/engine';
import {
  criteriaFor,
  loadCriteriaDb,
  searchCriteriaChemicals,
  type CriteriaDb,
} from './criteriaDb';

let db: CriteriaDb;
beforeAll(async () => {
  db = await loadCriteriaDb();
}, 30000);

const ZN = '7440-66-6';

describe('criteriaDb', () => {
  it('finds a chemical by name and by CAS number', () => {
    expect(searchCriteriaChemicals(db, 'zinc')[0]?.id).toBe(ZN);
    expect(searchCriteriaChemicals(db, '7440-66-6')[0]?.name).toBe('Zinc');
    expect(searchCriteriaChemicals(db, '')).toEqual([]);
  });

  it('gives zinc the printed saltwater values and a hardness equation for freshwater', () => {
    const c = criteriaFor(db, ZN, 'surfaceWater');
    const saltAcute = c.find((x) => x.endpoint === 'aquatic-saltwater-acute')!;
    const saltChronic = c.find((x) => x.endpoint === 'aquatic-saltwater-chronic')!;
    expect([saltAcute.value, saltChronic.value]).toEqual([90, 81]);
    const fresh = c.find((x) => x.endpoint === 'aquatic-freshwater-acute')!;
    expect(fresh.hardness).toBeDefined();
    expect(fresh.dissolved).toBe(true);
  });

  it('changes the zinc criterion with the hardness input', () => {
    const criteria = criteriaFor(db, ZN, 'surfaceWater');
    const at = (hardness: number) =>
      compareToCriteria({
        medium: 'surfaceWater',
        chemicalId: ZN,
        series: [1e-4],
        criteria,
        hardness,
        waterType: 'fresh',
      }).results.find((r) => r.criterion?.endpoint === 'aquatic-freshwater-acute')!;
    const r100 = at(100);
    const r200 = at(200);
    expect(r100.criterionValue! * 1e6).toBeCloseTo(117.2, 0);
    expect(r200.criterionValue!).toBeGreaterThan(r100.criterionValue! * 1.5);
    expect(r200.ratio!).toBeLessThan(r100.ratio!);
  });

  it('flags a ratio above 1 and not a ratio of exactly 1', () => {
    const criteria = criteriaFor(db, ZN, 'surfaceWater');
    const run = (ugL: number) =>
      compareToCriteria({
        medium: 'surfaceWater',
        chemicalId: ZN,
        series: [ugL * 1e-6],
        criteria,
        waterType: 'salt',
      }).results.find((r) => r.criterion?.endpoint === 'aquatic-saltwater-chronic')!;
    expect(run(81).exceeds).toBe(false);
    expect(run(81.5).exceeds).toBe(true);
    expect(run(40).exceeds).toBe(false);
  });

  it('marks aluminum site-specific rather than computing it', () => {
    const al = criteriaFor(db, '7429-90-5', 'surfaceWater');
    expect(al.length).toBeGreaterThan(0);
    expect(al.every((c) => c.siteSpecific === true && c.value === undefined)).toBe(true);
  });

  it('has no saltwater aluminum criterion at all, so the panel says no criterion', () => {
    const al = criteriaFor(db, '7429-90-5', 'surfaceWater');
    expect(al.some((c) => c.waterType === 'salt')).toBe(false);
    expect(al.some((c) => c.waterType === 'fresh' && c.siteSpecific === true)).toBe(true);
  });

  it('carries the pH the pentachlorophenol freshwater values are printed at, and not on saltwater', () => {
    const pcp = criteriaFor(db, '87-86-5', 'surfaceWater').filter((c) => c.waterType !== undefined);
    const fresh = pcp.filter((c) => c.waterType === 'fresh');
    expect(fresh.length).toBe(2);
    expect(fresh.every((c) => c.printedAtPh === 7.8)).toBe(true);
    expect(
      pcp.filter((c) => c.waterType === 'salt').every((c) => c.printedAtPh === undefined),
    ).toBe(true);
  });

  it('carries human health criteria with no water type, and benchmarks with their organic carbon basis', () => {
    const hh = criteriaFor(db, '83-32-9', 'surfaceWater').filter((c) =>
      c.endpoint.startsWith('human-health'),
    );
    expect(hh.map((c) => c.value)).toEqual([70, 90]);
    expect(hh.every((c) => c.waterType === undefined)).toBe(true);
    const sed = criteriaFor(db, '7429-90-5', 'sediment');
    expect(sed.length).toBeGreaterThan(0);
    expect(sed.every((c) => c.medium === 'sediment')).toBe(true);
    expect(db.criteria.some((c) => c.medium === 'sediment' && c.ocBasis === 0.01)).toBe(true);
  });

  it('keeps only concentration units and unique ids', () => {
    expect(db.criteria.every((c) => ['ug/L', 'mg/L', 'ug/kg', 'mg/kg'].includes(c.unit))).toBe(
      true,
    );
    expect(new Set(db.criteria.map((c) => c.id)).size).toBe(db.criteria.length);
  });
});
