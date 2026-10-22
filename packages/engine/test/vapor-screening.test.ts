import { describe, expect, it } from 'vitest';
import visl from '../../data/raw/visl/visl-default-resident-2026-10-22.json' with { type: 'json' };
import { references } from '../src/references/index.js';
import {
  ATTENUATION_FACTORS,
  FEET_TO_METRES,
  attenuationFactorRun,
  attenuationFactorScreeningLevel,
  henryAtTemperature,
  pviScreenRun,
  vaporAttenuationFactor2015,
  vaporPviScreen2015,
  type PviInput,
} from '../src/processes/vapor/index.js';
import { registry } from '../src/index.js';

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}

const UG_M3 = 1e-9; // kg/m^3 per ug/m^3
const UG_L = 1e-6; // kg/m^3 per ug/L

describe('attenuation factors (EPA 2015 Table 6-1)', () => {
  it('holds the published generic factors', () => {
    expect(ATTENUATION_FACTORS).toEqual({
      groundwater: 0.001,
      groundwaterFineGrained: 0.0005,
      subSlabSoilGas: 0.03,
      exteriorSoilGas: 0.03,
      crawlspace: 1.0,
    });
  });

  it('applies the factor to the source vapor, with H prime for groundwater', () => {
    const gw = attenuationFactorRun({ medium: 'groundwater', concentration: 1e-3, H: 0.25 });
    expect(rel(gw.sourceVapor, 0.25e-3)).toBeLessThan(1e-12);
    expect(rel(gw.indoorAir, 0.001 * 0.25e-3)).toBeLessThan(1e-12);
    const sg = attenuationFactorRun({ medium: 'subSlabSoilGas', concentration: 2e-3 });
    expect(rel(sg.indoorAir, 0.03 * 2e-3)).toBeLessThan(1e-12);
    const cs = attenuationFactorRun({ medium: 'crawlspace', concentration: 5e-4 });
    expect(cs.indoorAir).toBe(5e-4);
    const fg = attenuationFactorRun({
      medium: 'groundwaterFineGrained',
      concentration: 1e-3,
      H: 0.25,
    });
    expect(rel(fg.indoorAir, 0.0005 * 0.25e-3)).toBeLessThan(1e-12);
    expect(fg.warnings.map((w) => w.code)).toContain('vapor.af-fine-grained');
  });

  it('uses H prime at the groundwater temperature when thermodynamic data are entered', () => {
    const henry = { HR: 5.55e-3, dHvb: 7342, TB: 353.24, TC: 562.16, TS: 288.15 };
    const r = attenuationFactorRun({ medium: 'groundwater', concentration: 1e-3, henry });
    expect(rel(r.hPrime ?? 0, henryAtTemperature(henry).Hprime)).toBeLessThan(1e-12);
    expect(r.indoorAir).toBeCloseTo(0.001 * 1e-3 * (r.hPrime ?? 0), 15);
  });

  it('requires H prime for groundwater', () => {
    expect(() => attenuationFactorRun({ medium: 'groundwater', concentration: 1e-3 })).toThrow(
      RangeError,
    );
  });

  it('warns for a source within five feet of the foundation and for preferential pathways', () => {
    const near = attenuationFactorRun({
      medium: 'groundwater',
      concentration: 1e-3,
      H: 0.2,
      depthBelowFoundation: 4.9 * FEET_TO_METRES,
    });
    expect(near.warnings.map((w) => w.code)).toContain('vapor.af-shallow-source');
    const ok = attenuationFactorRun({
      medium: 'groundwater',
      concentration: 1e-3,
      H: 0.2,
      depthBelowFoundation: 5 * FEET_TO_METRES,
    });
    expect(ok.warnings.map((w) => w.code)).not.toContain('vapor.af-shallow-source');
    const pp = attenuationFactorRun({
      medium: 'subSlabSoilGas',
      concentration: 1e-3,
      preferentialPathway: true,
    });
    expect(pp.warnings.map((w) => w.code)).toContain('vapor.af-preferential-pathway');
  });

  it('is linear in the source concentration', () => {
    const a = attenuationFactorRun({ medium: 'groundwater', concentration: 1e-3, H: 0.3 });
    const b = attenuationFactorRun({ medium: 'groundwater', concentration: 2e-3, H: 0.3 });
    expect(rel(b.indoorAir, 2 * a.indoorAir)).toBeLessThan(1e-12);
  });

  describe('identity 8c: screening level times AF times H prime times 1000 L/m^3 = target air', () => {
    // the calculator's printed H prime and target indoor air for its five chemicals (the comparison with the
    // engine's own values is visl-sweep.test.ts); here they only supply a realistic set of numbers
    const printed = (cells: { column: string; value?: number }[], start: string): number =>
      cells.find((x) => x.column.startsWith(start))!.value!;
    for (const r of visl.results) {
      const c = {
        chemical: r.name,
        hPrime: printed(r.properties, "Henry's Law Constant Used in Calcs"),
        targetAirUgM3: printed(r.visl, 'Target Indoor Air Concentration'),
      };
      it(c.chemical, () => {
        const target = c.targetAirUgM3 * UG_M3;
        const gw = attenuationFactorScreeningLevel({
          medium: 'groundwater',
          targetIndoorAir: target,
          H: c.hPrime,
        });
        // ug/L: kg/m^3 over 1e-6; times AF H' and 1000 L/m^3 gives ug/m^3
        const slUgL = gw.screeningLevel / UG_L;
        expect(rel(slUgL * 0.001 * c.hPrime * 1000, c.targetAirUgM3)).toBeLessThan(1e-12);
        const sg = attenuationFactorScreeningLevel({
          medium: 'subSlabSoilGas',
          targetIndoorAir: target,
        });
        expect(rel(sg.screeningLevel * 0.03, target)).toBeLessThan(1e-12);
        // round trip through the forward run
        const back = attenuationFactorRun({
          medium: 'groundwater',
          concentration: gw.screeningLevel,
          H: c.hPrime,
        });
        expect(rel(back.indoorAir, target)).toBeLessThan(1e-12);
      });
    }
  });

  it('is registered and cites used references', () => {
    expect(registry.get('vapor.attenuation-factor-2015')).toBe(vaporAttenuationFactor2015);
    for (const k of vaporAttenuationFactor2015.citations) {
      expect(references.find((r) => r.key === k)?.status).toBe('used');
    }
    const r = vaporAttenuationFactor2015.run({
      medium: 'subSlabSoilGas',
      concentration: 1,
    });
    expect(r.indoorAir).toBe(0.03);
  });
});

const ft = FEET_TO_METRES;
const mgL = 1e-3;
const mgKg = 1e-6;

function pvi(over: Partial<PviInput> = {}): PviInput {
  return { separation: 100 * ft, ...over };
}

describe('PVI vertical separation screen (EPA 2015 Table 3)', () => {
  it('classifies a source as LNAPL only above the thresholds', () => {
    const t = (o: Partial<PviInput>) =>
      pviScreenRun(pvi({ smallestBuildingDimension: 30 * ft, ...o })).sourceType;
    expect(t({ groundwaterBenzene: 5 * mgL })).toBe('dissolved');
    expect(t({ groundwaterBenzene: 5.0001 * mgL })).toBe('lnapl');
    expect(t({ groundwaterTph: 30 * mgL })).toBe('dissolved');
    expect(t({ groundwaterTph: 30.001 * mgL })).toBe('lnapl');
    expect(t({ soilBenzene: 10 * mgKg })).toBe('dissolved');
    expect(t({ soilBenzene: 10.001 * mgKg })).toBe('lnapl');
    expect(t({ soilTph: 100 * mgKg })).toBe('dissolved');
    expect(t({ soilTph: 100.001 * mgKg })).toBe('lnapl');
    expect(t({ soilTph: 200 * mgKg, fuel: 'weathered' })).toBe('dissolved');
    expect(t({ soilTph: 250.001 * mgKg, fuel: 'weathered' })).toBe('lnapl');
  });

  it('needs 6 feet for a dissolved source of any building size', () => {
    const run = (sep: number, side?: number) =>
      pviScreenRun({
        groundwaterBenzene: 1 * mgL,
        separation: sep * ft,
        ...(side === undefined ? {} : { smallestBuildingDimension: side * ft }),
      });
    expect(run(6).verdict).toBe('screened-out');
    expect(run(5.99).verdict).toBe('further-assessment');
    expect(run(6, 500).verdict).toBe('screened-out');
    expect(run(6).requiredSeparation).toBeCloseTo(6 * ft, 12);
  });

  it('needs 15 feet for LNAPL under a building with a side shorter than 66 feet', () => {
    const run = (sep: number, side: number) =>
      pviScreenRun({
        groundwaterBenzene: 6 * mgL,
        separation: sep * ft,
        smallestBuildingDimension: side * ft,
      });
    expect(run(15, 65.99).verdict).toBe('screened-out');
    expect(run(14.99, 65.99).verdict).toBe('further-assessment');
    const large = run(15, 66);
    expect(large.verdict).toBe('further-assessment');
    expect(large.precluding).toContain('large-building-over-lnapl');
    expect(large.warnings.map((w) => w.code)).toContain('vapor.pvi-precluded');
  });

  it('forces further assessment for each precluding factor even with ample separation', () => {
    const flags = [
      ['preferentialPathways', 'preferential-pathways'],
      ['ethanolFraction', 'high-ethanol-blend'],
      ['leadScavengers', 'lead-scavengers'],
      ['extensiveSurfaceCover', 'impermeable-surface-cover'],
      ['contaminationContactsBuilding', 'contamination-contacts-building'],
    ] as const;
    for (const [key, name] of flags) {
      const over: Partial<PviInput> =
        key === 'ethanolFraction' ? { ethanolFraction: 0.2 } : { [key]: true };
      const r = pviScreenRun(pvi({ groundwaterBenzene: 1 * mgL, ...over }));
      expect(r.verdict).toBe('further-assessment');
      expect(r.precluding).toContain(name);
      expect(r.warnings.map((w) => w.code)).toContain('vapor.pvi-precluded');
    }
    expect(
      pviScreenRun(pvi({ groundwaterBenzene: 1 * mgL, ethanolFraction: 0.1999 })).verdict,
    ).toBe('screened-out');
  });

  it('shows the dissolved benzene above 1 mg/L note as information, not a verdict change', () => {
    const hi = pviScreenRun(pvi({ groundwaterBenzene: 2 * mgL }));
    expect(hi.sourceType).toBe('dissolved');
    expect(hi.verdict).toBe('screened-out');
    expect(hi.information.length).toBe(1);
    expect(pviScreenRun(pvi({ groundwaterBenzene: 0.5 * mgL })).information.length).toBe(0);
  });

  it('warns when nothing classifies the source and treats an explicit type as given', () => {
    const none = pviScreenRun(pvi());
    expect(none.sourceType).toBe('dissolved');
    expect(none.warnings.map((w) => w.code)).toContain('vapor.pvi-source-unclassified');
    const forced = pviScreenRun(pvi({ sourceType: 'lnapl', smallestBuildingDimension: 30 * ft }));
    expect(forced.sourceType).toBe('lnapl');
    expect(forced.requiredSeparation).toBeCloseTo(15 * ft, 12);
  });

  it('needs the building dimension for LNAPL', () => {
    expect(() => pviScreenRun(pvi({ groundwaterBenzene: 6 * mgL }))).toThrow(RangeError);
  });

  it('is registered and cites used references', () => {
    expect(registry.get('vapor.pvi-screen-2015')).toBe(vaporPviScreen2015);
    for (const k of vaporPviScreen2015.citations) {
      expect(references.find((r) => r.key === k)?.status).toBe('used');
    }
  });
});
