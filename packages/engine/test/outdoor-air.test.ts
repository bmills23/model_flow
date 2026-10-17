import { describe, expect, it } from 'vitest';
import r from './fixtures/vapor/risc-r3-r5.json' with { type: 'json' };
import { references } from '../src/references/index.js';
import {
  SSG_DEFAULT_EXPOSURE_S,
  SSG_DEFAULT_Q_OVER_C,
  SSG_Q_OVER_C_TABLE_3,
  boxConcentration,
  boxConcentrationFromFlux,
  outdoorAirBox,
  outdoorAirEpc,
  outdoorAirSsgVf1996,
  qOverCToSi,
  ssgApparentDiffusivity,
  ssgDiffusivityViaJury,
  ssgMassLimitVf,
  ssgQOverC,
  ssgVolatilizationFactor,
  steadyDiffusionFlux,
  type OutdoorBox,
  type SsgSoil,
} from '../src/processes/outdoorAir/index.js';
import { juryAverageFlux, juryTransport } from '../src/processes/vapor/index.js';

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}

const box: OutdoorBox = { length: 10, width: 4, height: 2, windSpeed: 2.25 };

describe('outdoor air box', () => {
  it('an area flux over the footprint gives F L / (u delta) for any width (identity 8g)', () => {
    const F = 3.7e-9;
    for (const width of [1, 4, 90]) {
      const b = { ...box, width };
      expect(
        rel(boxConcentrationFromFlux(b, F), (F * b.length) / (b.windSpeed * b.height)),
      ).toBeLessThan(1e-12);
    }
  });

  it('a mass rate gives E / (u delta W)', () => {
    expect(rel(boxConcentration(box, 1e-6), 1e-6 / (2.25 * 2 * 4))).toBeLessThan(1e-14);
  });

  it('Table R-6 column: the box hand value (the printed 2.27e-3 is not reproduced)', () => {
    const b = r.benzene;
    const chem = { Da: b.DaCm2PerS * 1e-4, Dw: b.DwCm2PerS * 1e-4, H: b.henry };
    const layers = [r.r5.capillaryFringe, ...r.r5.layers].map((l) => ({
      thickness: l.thicknessM,
      porosity: l.porosity,
      moisture: l.moisture,
    }));
    const cvs = chem.H * r.r5.groundwaterMgPerL * 1e-3; // kg/m^3
    const flux = steadyDiffusionFlux(layers, chem, cvs);
    const out = boxConcentrationFromFlux(
      { length: 10, width: 5, height: 2, windSpeed: 2.25 },
      flux,
    );
    // independent hand calculation
    let resist = 0;
    for (const l of layers) {
      const thetaA = l.porosity - l.moisture;
      const deff =
        (chem.Da * Math.pow(thetaA, 10 / 3) + (chem.Dw / chem.H) * Math.pow(l.moisture, 10 / 3)) /
        (l.porosity * l.porosity);
      resist += l.thickness / deff;
    }
    const hand = ((cvs / resist) * 10) / (2.25 * 2);
    expect(rel(out, hand)).toBeLessThan(1e-9);
    // recorded value of the note (2.5444e-6 mg/m^3), four figures
    expect(rel(out * 1e6, 2.5444e-6)).toBeLessThan(2e-4);
  });

  it('rejects invalid boxes', () => {
    expect(() => boxConcentration({ ...box, windSpeed: 0 }, 1)).toThrow(RangeError);
    expect(() => boxConcentration({ ...box, height: -1 }, 1)).toThrow(RangeError);
  });

  it('is linear in the emission (identity 8h)', () => {
    const c1 = boxConcentrationFromFlux(box, 1e-9);
    expect(rel(boxConcentrationFromFlux(box, 2e-9), 2 * c1)).toBeLessThan(1e-14);
  });

  it('runs as a registered-style descriptor', () => {
    const out = outdoorAirBox.run({ box, flux: 1e-9 });
    expect(rel(out.concentration, (1e-9 * 10) / (2.25 * 2))).toBeLessThan(1e-12);
    expect(outdoorAirBox.id).toBe('outdoorAir.box');
  });
});

describe('outdoorAirEpc interface', () => {
  it('sums box emissions and direct contributions per time, keeping the origins', () => {
    const out = outdoorAirEpc({
      box,
      emissions: [
        { origin: 'vapor.dominant-layer-1998', kind: 'areaFlux', flux: (t) => 1e-9 * (1 + t) },
        { origin: 'sprinkler', kind: 'massRate', rate: () => 2e-8 },
      ],
      direct: [{ origin: 'particulate', concentration: () => 5e-12 }],
    });
    expect(out.contributions.map((c) => c.origin)).toEqual([
      'vapor.dominant-layer-1998',
      'sprinkler',
      'particulate',
    ]);
    expect(out.contributions.map((c) => c.via)).toEqual(['box', 'box', 'direct']);
    const t = 3;
    const expected = (1e-9 * 4 * 40) / (2.25 * 2 * 4) + 2e-8 / (2.25 * 2 * 4) + 5e-12;
    expect(rel(out.concentration(t), expected)).toBeLessThan(1e-12);
    expect(out.warnings.map((w) => w.code)).toEqual(['outdoorAir.mixed-dispersion']);
  });

  it('uses an entered source area and warns when the source is larger than the box', () => {
    const out = outdoorAirEpc({
      box,
      emissions: [{ origin: 'big', kind: 'areaFlux', flux: () => 1e-9, area: 100 }],
      direct: [],
    });
    expect(rel(out.concentration(0), (1e-9 * 100) / (2.25 * 2 * 4))).toBeLessThan(1e-12);
    expect(out.warnings.map((w) => w.code)).toContain('outdoorAir.box-shorter-than-source');
  });

  it('needs a box only when an emission is present', () => {
    expect(() =>
      outdoorAirEpc({ emissions: [{ origin: 'x', kind: 'massRate', rate: () => 1 }], direct: [] }),
    ).toThrow(RangeError);
    const out = outdoorAirEpc({
      emissions: [],
      direct: [{ origin: 'pef', concentration: () => 1e-10 }],
    });
    expect(out.concentration(0)).toBe(1e-10);
    expect(out.warnings).toEqual([]);
  });

  it('an empty input is zero', () => {
    expect(outdoorAirEpc({ emissions: [], direct: [] }).concentration(5)).toBe(0);
  });
});

describe('Soil Screening Guidance volatilization factor', () => {
  const soil = (kocMlPerG: number): SsgSoil => ({
    porosity: 0.434,
    moisture: 0.15,
    bulkDensity: 1500,
    kd: kocMlPerG * 0.006 * 1e-3,
  });
  const chem = (Di: number, Dw: number, H: number) => ({ Da: Di * 1e-4, Dw: Dw * 1e-4, H });
  const qc = qOverCToSi(SSG_DEFAULT_Q_OVER_C);

  it('has the guidance defaults', () => {
    expect(SSG_DEFAULT_Q_OVER_C).toBe(68.81);
    expect(SSG_DEFAULT_EXPOSURE_S).toBe(9.5e8);
    expect(ssgQOverC('Los Angeles', 0.5)).toBe(68.81);
  });

  it('transcribes Table 3: 29 cities, 6 areas, decreasing with area', () => {
    expect(SSG_Q_OVER_C_TABLE_3).toHaveLength(29);
    for (const row of SSG_Q_OVER_C_TABLE_3) {
      expect(row.values).toHaveLength(6);
      for (let i = 1; i < 6; i++) {
        expect(row.values[i] as number, row.city).toBeLessThan(row.values[i - 1] as number);
      }
    }
    expect(ssgQOverC('Seattle', 30)).toBe(42.86);
    expect(ssgQOverC('Miami', 0.5)).toBe(85.61);
    expect(ssgQOverC('Casper', 0.5)).toBe(100.13);
    expect(() => ssgQOverC('Atlantis', 0.5)).toThrow(RangeError);
  });

  it('hand case in the published units (Equation 6 with exact pi)', () => {
    const c = chem(0.08, 1e-5, 0.2);
    const s = soil(100);
    const out = ssgVolatilizationFactor({ chemical: c, soil: s });
    // literal cgs evaluation of Equation 6
    const n = 0.434;
    const tw = 0.15;
    const ta = n - tw;
    const Kd = 100 * 0.006;
    const DA =
      (Math.pow(ta, 10 / 3) * 0.08 * 0.2 + Math.pow(tw, 10 / 3) * 1e-5) /
      (n * n) /
      (1.5 * Kd + tw + ta * 0.2);
    const vf = ((68.81 * Math.sqrt(Math.PI * DA * 9.5e8)) / (2 * 1.5 * DA)) * 1e-4;
    expect(rel(out.DA, DA * 1e-4)).toBeLessThan(1e-12);
    expect(rel(out.vfInfinite, vf)).toBeLessThan(1e-12);
    expect(out.vf).toBe(out.vfInfinite);
    expect(out.massLimited).toBe(false);
  });

  it('reproduces the volatilization factors printed in Table 3-A of the guidance', () => {
    // Table 3-A (VF, m^3/kg, two significant figures) from Table 36 (H'), Table 37 (D_i,a, D_i,w)
    // and the calculated K_oc of Table 39; default soil and the default Q/C and exposure interval.
    const rows = [
      { name: 'toluene', c: chem(0.087, 8.6e-6, 0.272), koc: 182, printed: 4.0e3 },
      { name: 'ethylbenzene', c: chem(0.075, 7.8e-6, 0.323), koc: 363, printed: 5.4e3 },
      { name: '1,2-dichlorobenzene', c: chem(0.069, 7.9e-6, 0.0779), koc: 617, printed: 1.5e4 },
      { name: '1,4-dichlorobenzene', c: chem(0.069, 7.9e-6, 0.0996), koc: 617, printed: 1.3e4 },
      { name: 'styrene', c: chem(0.071, 8.0e-6, 0.113), koc: 776, printed: 1.3e4 },
      { name: '1,2,4-trichlorobenzene', c: chem(0.03, 8.23e-6, 0.0582), koc: 1780, printed: 4.3e4 },
    ];
    for (const row of rows) {
      const out = ssgVolatilizationFactor({ chemical: row.c, soil: soil(row.koc), qOverC: qc });
      expect(rel(out.vfInfinite, row.printed), row.name).toBeLessThan(0.04);
    }
  });

  it('the infinite-source VF is the time average of the Jury flux (identity 8e)', () => {
    const c = chem(0.087, 8.6e-6, 0.272);
    const s = soil(182);
    const T = 9.5e8;
    const out = ssgVolatilizationFactor({ chemical: c, soil: s, qOverC: qc, exposureTime: T });
    // soil concentration 1 kg/kg dry soil -> C_T0 = rho_b; VF = (Q/C) C_soil / J_avg
    const jury = juryAverageFlux(
      {
        chemical: c,
        soil: s,
        layerThickness: Infinity,
        initialConcentration: s.bulkDensity,
      },
      T,
    );
    expect(rel(out.vfInfinite, qc / jury)).toBeLessThan(1e-9);
    expect(
      rel(
        out.DA,
        juryTransport({ chemical: c, soil: s, layerThickness: 1, initialConcentration: 1 }).DE,
      ),
    ).toBeLessThan(1e-12);
    expect(rel(ssgApparentDiffusivity(s, c), ssgDiffusivityViaJury(s, c))).toBeLessThan(1e-12);
  });

  it('mass-limit VF (Equation 55) and its use as the lower bound', () => {
    const c = chem(0.087, 8.6e-6, 0.272);
    const s = soil(182);
    // Equation 55 in the published units: (Q/C) T / (rho_b d_s 1e6 g/Mg), T in seconds
    const ds = 0.5;
    const hand = (68.81 * 9.5e8) / (1.5 * ds * 1e6);
    expect(rel(ssgMassLimitVf(s, qc, 9.5e8, ds), hand)).toBeLessThan(1e-12);
    // a deep source: the infinite VF governs; a shallow source: the mass limit governs
    const deep = ssgVolatilizationFactor({ chemical: c, soil: s, sourceDepth: 100 });
    expect(deep.massLimited).toBe(false);
    expect(deep.vf).toBe(deep.vfInfinite);
    const shallow = ssgVolatilizationFactor({ chemical: c, soil: s, sourceDepth: 0.01 });
    expect(shallow.massLimited).toBe(true);
    expect(shallow.vf).toBe(shallow.vfMassLimit);
    expect(shallow.warnings.map((w) => w.code)).toContain('outdoorAir.ssg-mass-limit');
  });

  it('VF scales inversely with Q/C input and rejects bad input', () => {
    const c = chem(0.087, 8.6e-6, 0.272);
    const a = ssgVolatilizationFactor({ chemical: c, soil: soil(182), qOverC: qc });
    const b = ssgVolatilizationFactor({ chemical: c, soil: soil(182), qOverC: 2 * qc });
    expect(rel(b.vf, 2 * a.vf)).toBeLessThan(1e-12);
    expect(() => ssgVolatilizationFactor({ chemical: c, soil: soil(182), qOverC: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('descriptors', () => {
  it('cite references that exist', () => {
    const keys = new Set(references.map((x) => x.key));
    for (const m of [outdoorAirBox, outdoorAirSsgVf1996]) {
      expect(m.citations.length).toBeGreaterThan(0);
      for (const k of m.citations) expect(keys.has(k), `${m.id} ${k}`).toBe(true);
    }
  });
});
