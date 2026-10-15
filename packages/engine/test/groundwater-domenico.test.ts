import { describe, expect, it } from 'vitest';
import {
  domenicoConcentration,
  domenicoWarnings,
  groundwaterDomenico,
  groundwaterAt123d,
  groundwaterWexler,
  type DomenicoInput,
} from '../src/processes/groundwater/index.js';
import { references } from '../src/references/index.js';
import { registry } from '../src/index.js';

const base: DomenicoInput = {
  velocity: 0.2,
  retardation: 1.5,
  decayRate: 0.002,
  alphaL: 10,
  alphaT: 1,
  alphaV: 0.1,
  c0: 10,
  sourceWidth: 20,
  sourceThickness: 3,
};

describe('Domenico 1987 comparison mode', () => {
  it('returns C0 at the source centre at steady state without decay or dispersion', () => {
    const c = domenicoConcentration(
      { ...base, decayRate: 0, alphaL: 1e-9, alphaT: 1e-9, alphaV: 1e-9 },
      { x: 1e-3, y: 0, z: 0 },
      Infinity,
    );
    expect(c / 10).toBeCloseTo(1, 4);
  });

  it('is symmetric in y and decreases away from the centreline', () => {
    const a = domenicoConcentration(base, { x: 50, y: 6, z: 0 }, 2000);
    const b = domenicoConcentration(base, { x: 50, y: -6, z: 0 }, 2000);
    const c = domenicoConcentration(base, { x: 50, y: 0, z: 0 }, 2000);
    expect(a).toBeCloseTo(b, 12);
    expect(c).toBeGreaterThan(a);
  });

  it('flags the approximation, off-centreline use with decay, and large departures from the exact solution', () => {
    const centre = domenicoWarnings(base, { x: 50, y: 0, z: 0 }, 2000).map((w) => w.code);
    expect(centre).toContain('domenico.approximate-longitudinal-dispersion');
    expect(centre).not.toContain('domenico.off-centreline-with-decay');
    const off = domenicoWarnings(base, { x: 50, y: 10, z: 0 }, 2000).map((w) => w.code);
    expect(off).toContain('domenico.off-centreline-with-decay');
    // fixture case: the exact solution is about 2x the Domenico value near the source
    const dev = domenicoWarnings(base, { x: 50, y: 0, z: 0 }, 200).map((w) => w.code);
    expect(dev).toContain('domenico.deviates-from-exact');
  });

  it('emits no approximation warning when longitudinal dispersivity is zero-like and the point is on the centreline without decay', () => {
    const codes = domenicoWarnings(
      { ...base, alphaL: 0, decayRate: 0 },
      { x: 50, y: 0, z: 0 },
      Infinity,
    ).map((w) => w.code);
    expect(codes).not.toContain('domenico.approximate-longitudinal-dispersion');
  });
});

describe('registered groundwater methods', () => {
  it('registers the legacy AT123D-class, modern Wexler and Domenico comparison methods', () => {
    const gw = registry.list('groundwater');
    const ids = gw.map((m) => `${m.id}:${m.kind}`).sort();
    expect(ids).toEqual(
      [
        'groundwater.at123d:legacy',
        'groundwater.domenico1987:modern',
        'groundwater.wexler1992:modern',
      ].sort(),
    );
    expect(groundwaterDomenico.name).toMatch(/BIOSCREEN\/RBCA-compatible comparison/);
    expect(groundwaterDomenico.summary).toMatch(/not the recommended/i);
  });

  it('declares only citations that exist in references.json with status used', () => {
    for (const m of [groundwaterAt123d, groundwaterWexler, groundwaterDomenico]) {
      expect(m.citations.length).toBeGreaterThan(0);
      for (const key of m.citations) {
        const ref = references.find((r) => r.key === key);
        expect(ref, `${m.id} cites ${key}`).toBeDefined();
        expect(ref!.status, `${key} status`).toBe('used');
      }
    }
  });
});
