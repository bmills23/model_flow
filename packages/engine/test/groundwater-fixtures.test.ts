import { describe, expect, it } from 'vitest';
import {
  at123dConcentration,
  domenicoConcentration,
  patchfConcentration,
  patchiConcentration,
  type BoxSource,
} from '../src/processes/groundwater/index.js';
import point3Nodecay from './fixtures/analgwst/point3-nodecay.json' with { type: 'json' };
import point3Decay from './fixtures/analgwst/point3-decay.json' with { type: 'json' };
import patchiNodecay from './fixtures/analgwst/patchi-nodecay.json' with { type: 'json' };
import patchiDecay from './fixtures/analgwst/patchi-decay.json' with { type: 'json' };
import patchfNodecay from './fixtures/analgwst/patchf-nodecay.json' with { type: 'json' };
import patchfDecay from './fixtures/analgwst/patchf-decay.json' with { type: 'json' };
import mibitransCases from './fixtures/mibitrans/cases.json' with { type: 'json' };

const analgwst: Record<string, unknown> = {
  'point3-nodecay': point3Nodecay,
  'point3-decay': point3Decay,
  'patchi-nodecay': patchiNodecay,
  'patchi-decay': patchiDecay,
  'patchf-nodecay': patchfNodecay,
  'patchf-decay': patchfDecay,
};
const load = (path: string): unknown =>
  path.startsWith('mibitrans/')
    ? mibitransCases
    : analgwst[path.replace(/^analgwst\/|\.json$/g, '')];

interface AnalgwstFile {
  inputs: Record<string, number | number[]>;
  results: { t: number; z: number; c: number[][] }[];
}

/**
 * Compare against a USGS table. The programs print 6 decimals (POINT3, PATCHI) or 5 (PATCHF), so the
 * agreement bound is the print rounding, half a unit in the last place.
 */
function compare(
  file: AnalgwstFile,
  eval_: (x: number, y: number, z: number, t: number) => number,
  absTol: number,
  relTol: number,
): { worst: number; n: number } {
  const x = file.inputs.x as number[];
  const y = file.inputs.y as number[];
  let worst = 0;
  let n = 0;
  for (const block of file.results) {
    for (let ix = 0; ix < x.length; ix++) {
      for (let iy = 0; iy < y.length; iy++) {
        const ref = block.c[ix]![iy]!;
        const got = eval_(x[ix]!, y[iy]!, block.z, block.t);
        const dev = Math.abs(got - ref) - relTol * Math.abs(ref);
        worst = Math.max(worst, dev);
        n++;
        expect(
          Math.abs(got - ref),
          `x=${x[ix]} y=${y[iy]} z=${block.z} t=${block.t} ref=${ref} got=${got}`,
        ).toBeLessThanOrEqual(absTol + relTol * Math.abs(ref));
      }
    }
  }
  return { worst, n };
}

describe('USGS ANALGWST 1.1 POINT3: continuous point source in an infinite aquifer', () => {
  for (const name of ['point3-nodecay', 'point3-decay']) {
    it(`${name} (AT123D-class kernel with a degenerate box)`, () => {
      const f = load(`analgwst/${name}.json`) as AnalgwstFile;
      const i = f.inputs as Record<string, number>;
      const point: BoxSource = { x1: i.xc!, x2: i.xc!, y1: i.yc!, y2: i.yc!, z1: i.zc!, z2: i.zc! };
      const r = compare(
        f,
        (x, y, z, t) =>
          at123dConcentration(
            {
              aquifer: {
                velocity: i.v!,
                porosity: i.por!,
                decayRate: i.dk!,
                dx: i.dx!,
                dy: i.dy!,
                dz: i.dz!,
                // POINT3 is the whole-space medium, with the source at zc = 0 inside it
                top: 'unbounded',
              },
              source: point,
              loading: [{ start: 0, end: Infinity, rate: i.c0! * i.qm! }],
              time: t,
            },
            { x, y, z },
          ),
        5.1e-7,
        1e-9,
      );
      expect(r.n).toBeGreaterThan(100);
    });
  }
});

describe('USGS ANALGWST 1.1 PATCHI and PATCHF patch sources', () => {
  for (const name of ['patchi-nodecay', 'patchi-decay']) {
    it(`${name}`, () => {
      const f = load(`analgwst/${name}.json`) as AnalgwstFile;
      const i = f.inputs as Record<string, number>;
      compare(
        f,
        (x, y, z, t) =>
          patchiConcentration(
            {
              velocity: i.v!,
              decayRate: i.dk!,
              dx: i.dx!,
              dy: i.dy!,
              dz: i.dz!,
              c0: i.c0!,
              patch: { y1: i.y1!, y2: i.y2!, z1: i.z1!, z2: i.z2! },
            },
            { x, y, z },
            t,
          ),
        5.1e-7,
        1e-9,
      );
    });
  }
  for (const name of ['patchf-nodecay', 'patchf-decay']) {
    it(`${name}`, () => {
      const f = load(`analgwst/${name}.json`) as AnalgwstFile;
      const i = f.inputs as Record<string, number>;
      compare(
        f,
        (x, y, z, t) =>
          patchfConcentration(
            {
              velocity: i.v!,
              decayRate: i.dk!,
              dx: i.dx!,
              dy: i.dy!,
              dz: i.dz!,
              c0: i.c0!,
              patch: { y1: i.y1!, y2: i.y2!, z1: i.z1!, z2: i.z2! },
            },
            { x, y, z },
            t,
            { width: i.w!, thickness: i.h! },
          ).value,
        5.1e-6,
        1e-9,
      );
    });
  }
});

interface MibCase {
  inputs: {
    velocity: number;
    porosity: number;
    alpha_x: number;
    alpha_y: number;
    alpha_z: number;
    retardation: number;
    decay_rate: number;
    source_zone_boundary: number[];
    source_zone_concentration: number[];
    depth: number;
  };
  points: { x: number; y: number; t: number; domenico: number; exact: number }[];
}

describe('mibitrans 1.0.1 cross-checks', () => {
  const cases = (load('mibitrans/cases.json') as { cases: Record<string, MibCase> }).cases;
  for (const [name, c] of Object.entries(cases)) {
    const i = c.inputs;
    const dom = {
      velocity: i.velocity,
      retardation: i.retardation,
      decayRate: i.decay_rate,
      alphaL: i.alpha_x,
      alphaT: i.alpha_y,
      alphaV: i.alpha_z,
      c0: i.source_zone_concentration[0]!,
      sourceWidth: 2 * i.source_zone_boundary[0]!,
      sourceThickness: i.depth,
    };
    it(`${name}: truncated Domenico (BIOSCREEN) matches mibitrans Bioscreen`, () => {
      for (const p of c.points) {
        const got = domenicoConcentration(dom, { x: p.x, y: p.y, z: 0 }, p.t);
        expect(Math.abs(got - p.domenico)).toBeLessThanOrEqual(1e-9 + 1e-9 * Math.abs(p.domenico));
      }
    });
    it(`${name}: exact patch solution (PATCHI form) matches mibitrans Mibitrans`, () => {
      const u = i.velocity / i.retardation;
      for (const p of c.points) {
        const got = patchiConcentration(
          {
            velocity: u,
            decayRate: i.decay_rate,
            dx: i.alpha_x * u,
            dy: i.alpha_y * u,
            dz: i.alpha_z * u,
            c0: dom.c0,
            patch: {
              y1: -i.source_zone_boundary[0]!,
              y2: i.source_zone_boundary[0]!,
              z1: -i.depth,
              z2: i.depth,
            },
          },
          { x: p.x, y: p.y, z: 0 },
          p.t,
        );
        expect(Math.abs(got - p.exact)).toBeLessThanOrEqual(1e-10 + 1e-7 * Math.abs(p.exact));
      }
    });
  }
});
