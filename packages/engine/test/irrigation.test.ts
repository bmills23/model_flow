import { describe, expect, it } from 'vitest';
import {
  dropletFraction,
  filmCoefficients,
  overallLiquidCoefficient,
} from '../src/processes/shower/index.js';
import {
  irrigationEpcs,
  irrigationSource,
  sprinklerAir,
  sprinklerEmission,
  type SprinklerInput,
} from '../src/processes/irrigation/index.js';
import { outdoorAirEpc } from '../src/processes/outdoorAir/index.js';

const refs = { gasCmPerH: 3000, liquidCmPerH: 20 };
const sp: SprinklerInput = {
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 2e-3,
  fallTime: 2,
  sprinklerFlow: 2e-4, // m^3/s
  filmReferences: refs,
};
const codes = (w: { code: string }[]) => w.map((x) => x.code);

describe('sprinkler emission', () => {
  it('E = f_v Q C_w with the shared droplet kernel (hand case)', () => {
    const { kg, kl } = filmCoefficients(78, refs);
    const kL = overallLiquidCoefficient(kl, kg, 0.2);
    const fv = dropletFraction(kL, 2, 2e-3);
    const r = sprinklerEmission(1e-3, sp);
    expect(r.dropletFraction).toBeCloseTo(fv, 12);
    expect(r.emission.kind).toBe('massRate');
    if (r.emission.kind === 'massRate') {
      expect(r.emission.rate(0)).toBeCloseTo(fv * 2e-4 * 1e-3, 18);
      expect(r.emission.rate(1e9)).toBeCloseTo(fv * 2e-4 * 1e-3, 18);
    }
    expect(r.coefficient).toBeCloseTo(fv * 2e-4, 18);
  });
  it('is linear in C_w and zero for zero concentration', () => {
    const a = sprinklerEmission(1e-3, sp).coefficient;
    const b = sprinklerEmission(5e-3, sp).coefficient;
    expect(a).toBe(b);
    const z = sprinklerEmission(0, sp);
    if (z.emission.kind === 'massRate') expect(z.emission.rate(0)).toBe(0);
  });
  it('warns when film references are defaulted', () => {
    const rest: SprinklerInput = { ...sp };
    delete rest.filmReferences;
    expect(codes(sprinklerEmission(1e-3, rest).warnings)).toContain(
      'shower.film-reference-unverified',
    );
    expect(codes(sprinklerEmission(1e-3, sp).warnings)).not.toContain(
      'shower.film-reference-unverified',
    );
  });
  it('rejects nonpositive flow, diameter and negative concentration', () => {
    expect(() => sprinklerEmission(1e-3, { ...sp, sprinklerFlow: 0 })).toThrow(RangeError);
    expect(() => sprinklerEmission(1e-3, { ...sp, dropletDiameter: 0 })).toThrow(RangeError);
    expect(() => sprinklerEmission(-1, sp)).toThrow(RangeError);
  });
});

describe('sprinkler box identity', () => {
  it('C_a = E / (u delta W), width default 1 m is warned', () => {
    const box = { height: 2, windSpeed: 3, length: 10 };
    const r = sprinklerAir(1e-3, sp, box);
    const E = sprinklerEmission(1e-3, sp).coefficient * 1e-3;
    expect(r.concentration).toBeCloseTo(E / (3 * 2 * 1), 18);
    expect(codes(r.warnings)).toContain('irrigation.box-width-default');
    const w = sprinklerAir(1e-3, sp, { ...box, width: 4 });
    expect(w.concentration).toBeCloseTo(E / (3 * 2 * 4), 18);
    expect(codes(w.warnings)).not.toContain('irrigation.box-width-default');
    expect(r.coefficient).toBeCloseTo(r.concentration / 1e-3, 18);
  });
  it('agrees with outdoorAirEpc fed the emission', () => {
    const box = { height: 2, windSpeed: 3, length: 10, width: 1 };
    const { emission } = sprinklerEmission(1e-3, sp);
    const out = outdoorAirEpc({ box, emissions: [emission], direct: [] });
    expect(out.concentration(0)).toBeCloseTo(
      sprinklerAir(1e-3, sp, { height: 2, windSpeed: 3, length: 10, width: 1 }).concentration,
      18,
    );
  });
});

describe('irrigation EPCs', () => {
  const p = {
    sprinkler: sp,
    box: { height: 2, windSpeed: 3, length: 10, width: 1 },
    applicationRate: 1e-7,
    chemical: 'benzene',
  };
  it('ingestion and dermal EPCs equal the water concentration; spray air is the box value', () => {
    const r = irrigationEpcs(1e-3, p);
    expect(r.ingestion).toBe(1e-3);
    expect(r.dermal).toBe(1e-3);
    expect(r.sprayAir).toBeCloseTo(sprinklerAir(1e-3, sp, p.box).concentration, 18);
    expect(r.forPlants.origin).toBe('irrigation.pathways');
    expect(r.forPlants.waterConcentration(0)).toBe(1e-3);
    expect(r.forPlants.applicationRate).toBe(1e-7);
    expect(r.forPlants.chemical).toBe('benzene');
  });
  it('warns when the source is also the potable supply', () => {
    expect(codes(irrigationEpcs(1e-3, { ...p, alsoPotable: true }).warnings)).toContain(
      'irrigation.potable-source',
    );
    expect(codes(irrigationEpcs(1e-3, p).warnings)).not.toContain('irrigation.potable-source');
  });
  it('is linear in C_w', () => {
    const a = irrigationEpcs(1e-3, p);
    const b = irrigationEpcs(4e-3, p);
    expect(b.sprayAir / a.sprayAir).toBeCloseTo(4, 12);
  });
});

describe('IrrigationSource shape', () => {
  it('carries a time-varying series, a season and the chemical', () => {
    const src = irrigationSource({
      waterConcentration: (t) => 1e-3 * (1 + t),
      applicationRate: 2e-8,
      season: { startDay: 120, endDay: 270 },
      chemical: 'tce',
    });
    expect(src.origin).toBe('irrigation.pathways');
    expect(src.waterConcentration(2)).toBeCloseTo(3e-3, 15);
    expect(src.season).toEqual({ startDay: 120, endDay: 270 });
    expect(src.chemical).toBe('tce');
  });
  it('rejects a nonpositive rate and a bad season', () => {
    const base = { waterConcentration: () => 1, applicationRate: 1e-8, chemical: 'x' };
    expect(() => irrigationSource({ ...base, applicationRate: 0 })).toThrow(RangeError);
    expect(() => irrigationSource({ ...base, season: { startDay: 200, endDay: 100 } })).toThrow(
      RangeError,
    );
    expect(() => irrigationSource({ ...base, season: { startDay: -1, endDay: 100 } })).toThrow(
      RangeError,
    );
  });
});
