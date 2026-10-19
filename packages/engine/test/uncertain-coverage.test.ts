import { describe, expect, it } from 'vitest';
import {
  checkUncertainInputs,
  outdoorAirBox,
  outdoorAirSsgVf1996,
  saturatedExponential,
  saturatedTwoRegion,
  surfaceWaterLegacy,
  surfaceWaterModern,
  vadoseLayered,
  vadoseVadsat,
  vaporAttenuationFactor2015,
  vaporDevaull2007,
  vaporDominantLayer1998,
  vaporJe1991,
  vaporJeEpa,
  vaporJuryBam,
  vaporPviScreen2015,
  type MethodDescriptor,
  type UncertainInput,
} from '../src/index.js';
import * as b from './uncertainBases.js';

interface Case {
  name: string;
  method: unknown;
  /** Base inputs; together they must make every declared id present at least once. */
  bases: unknown[];
  /** Ids that must be declared. */
  expect: string[];
}

const cases: Case[] = [
  {
    name: 'vadose.vadsat',
    method: vadoseVadsat,
    bases: [b.vadsatBase],
    expect: [
      'vadose.infiltration',
      'vadose.source.F',
      'vadose.below.thickness',
      'vadose.below.foc',
      'vadose.chemical.Koc',
      'vadose.alphaL',
    ],
  },
  {
    name: 'vadose.layered',
    method: vadoseLayered,
    bases: [b.layeredBase, b.layeredWideBase],
    expect: [
      'vadose.infiltration',
      'vadose.source.F',
      'vadose.below0.thickness',
      'vadose.below2.Ks',
      'vadose.above1.foc',
      'vadose.chemical.H',
    ],
  },
  {
    name: 'saturatedSource.two-region',
    method: saturatedTwoRegion,
    bases: [b.saturatedTwoRegionBase],
    expect: [
      'saturatedSource.aquifer.conductivity',
      'saturatedSource.source.fluctuation',
      'saturatedSource.chemical.F',
      'saturatedSource.soil.foc',
    ],
  },
  {
    name: 'saturatedSource.exponential',
    method: saturatedExponential,
    bases: [b.saturatedExponentialBase],
    expect: ['saturatedSource.aquifer.gradient', 'saturatedSource.sourceDecayRate'],
  },
  {
    name: 'vapor.je-1991',
    method: vaporJe1991,
    bases: [
      b.legacyJeBase,
      b.legacyJeGroundwaterBase,
      b.legacyJeDpBase,
      b.legacyJeConductivityBase,
    ],
    expect: [
      'vapor.building.volume',
      'vapor.layer0.thickness',
      'vapor.source.F',
      'vapor.source.cgw',
    ],
  },
  {
    name: 'vapor.dominant-layer-1998',
    method: vaporDominantLayer1998,
    bases: [
      b.dominantLayerBase,
      b.dominantLayerDpBase,
      b.dominantLayerGroundwaterBase,
      b.dominantLayerConductivityBase,
    ],
    expect: ['vapor.layer2.rate', 'vapor.source.csg', 'vapor.chemical.H'],
  },
  {
    name: 'vapor.je-epa',
    method: vaporJeEpa,
    bases: [b.epaJeBase, b.epaJeWideBase, b.epaJeDpBase],
    expect: ['vapor.temperature', 'vapor.stratum0.thickness', 'vapor.building.airExchangeRate'],
  },
  {
    name: 'vapor.devaull-2007',
    method: vaporDevaull2007,
    bases: [b.devaullBase, b.devaullCoupledBase, b.devaullSoilBase, b.devaullGroundwaterBase],
    expect: ['vapor.degradationRate', 'vapor.oxygen.aerobicDepth', 'vapor.oxygen.massRatio'],
  },
  {
    name: 'vapor.attenuation-factor-2015',
    method: vaporAttenuationFactor2015,
    bases: [b.attenuationBase],
    expect: ['vapor.concentration', 'vapor.H'],
  },
  {
    name: 'vapor.pvi-screen-2015',
    method: vaporPviScreen2015,
    bases: [b.pviBase],
    expect: ['vapor.separation', 'vapor.ethanolFraction'],
  },
  {
    name: 'vapor.jury-bam',
    method: vaporJuryBam,
    bases: [b.juryBase],
    expect: ['vapor.soil.bulkDensity', 'vapor.layerThickness', 'vapor.decayRate'],
  },
  {
    name: 'outdoorAir.box',
    method: outdoorAirBox,
    bases: [b.outdoorBoxBase],
    expect: ['outdoorAir.box.windSpeed', 'outdoorAir.box.height', 'outdoorAir.flux'],
  },
  {
    name: 'outdoorAir.ssg-vf-1996',
    method: outdoorAirSsgVf1996,
    bases: [b.ssgVfBase],
    expect: ['outdoorAir.qOverC', 'outdoorAir.soil.moisture'],
  },
  {
    name: 'surfaceWater.well-mixed',
    method: surfaceWaterLegacy,
    bases: [b.surfaceLegacyBase, b.surfaceLegacyLakeBase],
    expect: [
      'surfaceWater.upstreamFlow',
      'surfaceWater.mixingFraction',
      'surfaceWater.discharge.bedConductivity',
      'surfaceWater.discharge.flow',
      'surfaceWater.body.crossSection',
      'surfaceWater.body.volume',
      'surfaceWater.reach.length',
      'surfaceWater.reach.distance',
      'surfaceWater.sediment.fractionOrganicCarbon',
    ],
  },
  {
    name: 'surfaceWater.mass-discharge',
    method: surfaceWaterModern,
    bases: [b.surfaceModernBase, b.surfaceModernLakeBase],
    expect: [
      'surfaceWater.decay',
      'surfaceWater.bank.groundwaterFlow',
      'surfaceWater.downstream.distance',
      'surfaceWater.body.volume',
      'surfaceWater.sediment.kd',
    ],
  },
];

const CATEGORIES = ['exposure', 'transport', 'site', 'chemical'];

describe.each(cases)('uncertain inputs of $name', (c) => {
  const method = c.method as MethodDescriptor<unknown, unknown>;
  const inputs = (method.uncertainInputs ?? []) as readonly UncertainInput<unknown>[];
  const process = method.process;

  it('declares the expected ids, prefixed by the process, in a transport or site category', () => {
    const ids = inputs.map((u) => u.id);
    for (const id of c.expect) expect(ids, id).toContain(id);
    for (const u of inputs) {
      expect(u.id.startsWith(`${process}.`), u.id).toBe(true);
      expect(CATEGORIES).toContain(u.category);
      expect(u.category).not.toBe('exposure');
      expect(u.label.length).toBeGreaterThan(2);
      expect(u.unit.length).toBeGreaterThan(0);
    }
  });

  it('every input is present in at least one base, which lies inside its bounds', () => {
    for (const u of inputs) {
      const vals = c.bases.map((x) => u.get(x)).filter((v) => !Number.isNaN(v));
      expect(vals.length, `${u.id} absent from every base`).toBeGreaterThan(0);
      for (const v of vals) {
        expect(v, u.id).toBeGreaterThanOrEqual(u.bounds[0]);
        expect(v, u.id).toBeLessThanOrEqual(u.bounds[1]);
      }
    }
  });

  it('passes the registry contract on each base', () => {
    for (const base of c.bases) {
      const present = inputs.filter((u) => !Number.isNaN(u.get(base)));
      expect(() => checkUncertainInputs(present, base, 0.5)).not.toThrow();
    }
  });

  it('setting a value back to itself leaves the input unchanged', () => {
    for (const base of c.bases) {
      for (const u of inputs) {
        const v = u.get(base);
        if (Number.isNaN(v)) continue;
        expect(u.set(base, v), u.id).toEqual(base);
      }
    }
  }, 120_000);

  it('a perturbed value either runs or is refused as a RangeError, never a TypeError', () => {
    for (const base of c.bases) {
      for (const u of inputs) {
        const v = u.get(base);
        if (Number.isNaN(v) || !Number.isFinite(v) || v === 0) continue;
        const up = v * 1.05;
        const w = up <= u.bounds[1] ? up : v * 0.95;
        try {
          method.run(u.set(base, w));
        } catch (e) {
          expect(e, `${u.id}: ${String(e)}`).toBeInstanceOf(RangeError);
        }
      }
    }
  }, 120_000);
});
