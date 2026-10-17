import { describe, expect, it } from 'vitest';
import {
  dissolvedChain,
  evaluateModeled,
  layeredChain,
  legacyEvaluator,
  modernEvaluator,
  saturatedChain,
  solveModeled,
  tphSource,
  vadsatChain,
  wellConcentrationMetric,
  type Chain,
  type ChainChemical,
  type Transport,
} from '../src/processes/cleanup/chains.js';
import {
  LEGACY_PRESETS,
  legacyReceptor,
  modernChemical,
  modernResident,
  type LegacyChemical,
  type ModernChemical,
  type PathwayId,
} from '../src/processes/exposure/index.js';
import {
  waterTableSource,
  type LayeredInput,
  type VadsatInput,
} from '../src/processes/vadose/index.js';
import type { SaturatedSourceInput } from '../src/processes/saturatedSource/index.js';
import { YEAR_SECONDS } from '../src/processes/saturatedSource/release.js';
import { benzeneBoundary, bapBoundary, legacyBenzene } from './scenarioHelpers.js';
import { handInput } from './saturatedHelpers.js';

const YEAR = YEAR_SECONDS;
const DAY = 86400;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const benzene = modernChemical(benzeneBoundary);
const bap = modernChemical(bapBoundary);
const resident = modernResident();
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];
const modern = modernEvaluator([{ label: 'resident', receptor: resident, pathways: WATER }]);

// ---------------------------------------------------------------- transports

const aquifer = {
  velocity: 2e-7,
  porosity: 0.3,
  retardation: 1.7,
  decayRate: 0,
  dx: 4e-7,
  dy: 1e-7,
  dz: 2e-8,
  thickness: 3,
};
const darcyFlux = aquifer.velocity * aquifer.porosity;
const points = [
  { x: 25, y: 0, z: 1.5 },
  { x: 25, y: 0, z: 2.5 },
];
const times = Array.from({ length: 8 }, (_, k) => (k + 3) * YEAR);

const at123d: Transport = {
  kind: 'at123d',
  aquifer,
  source: waterTableSource(10, 10, { thickness: 3 }),
  darcyFlux,
  crossSection: 10 * 3,
  points,
};
const wexler: Transport = {
  kind: 'wexler',
  params: {
    velocity: aquifer.velocity / 1.7,
    dx: 4e-7 / 1.7,
    dy: 1e-7 / 1.7,
    dz: 2e-8 / 1.7,
    c0: 1,
    patch: { y1: -5, y2: 5, z1: 0, z2: 3 },
  },
  darcyFlux,
  crossSection: 30,
  points: points.map((p) => ({ ...p, y: p.y + 0.5 })),
};
const domenico: Transport = {
  kind: 'domenico',
  params: {
    velocity: aquifer.velocity,
    retardation: 1.7,
    alphaL: 2,
    alphaT: 0.2,
    alphaV: 0.02,
    c0: 1,
    sourceWidth: 10,
    sourceThickness: 3,
  },
  darcyFlux,
  crossSection: 30,
  points,
};

// ---------------------------------------------------------------- sources

const soil = { thetaS: 0.35, thetaR: 0.05, n: 2.68, Ks: 10 / DAY, rhoB: 1700, foc: 0.01 };
const benzeneVadose = {
  M: 0.078,
  S: 1.75,
  H: 0.228,
  Koc: 0.059,
  Da: 0.088e-4,
  Dw: 9.8e-10,
  mu: 0.001 / DAY,
};
function vadsatInput(f: number, ft?: number): VadsatInput {
  return {
    q: 0.2 / YEAR,
    depthToSource: 4,
    above: soil,
    lens: { ...soil, n: 2, thetaR: 0.15, Ks: 1 / DAY, thickness: 0.2 },
    source: {
      ...soil,
      thickness: 3,
      length: 10,
      width: 10,
      F: f,
      ...(ft === undefined ? {} : { FT: ft, MT: 0.1 }),
    },
    below: { ...soil, thickness: 2.8 },
    chemical: benzeneVadose,
    duration: 10 * YEAR,
  };
}
const STEP = YEAR;
const base = { times, transport: at123d, stepLength: STEP };

const dissolved = (t: Transport): Chain => dissolvedChain({ times, transport: t, cap: 1.75 });
const vadsatPlain = (): Chain => vadsatChain({ ...base, makeInput: (f) => vadsatInput(f) });
const tphKept = tphSource(500e-6, 5000e-6, 'kept');
const vadsatResidual = (tph = tphKept): Chain =>
  vadsatChain({
    ...base,
    cap: tph.cap,
    makeInput: (f) => {
      const x = tph.at(f);
      return vadsatInput(x.F, x.FT);
    },
  });

function satInput(f: number): SaturatedSourceInput {
  const h = handInput('A');
  const ft = h.chemical.FT === undefined ? {} : { FT: (h.chemical.FT * f) / h.chemical.F };
  return { ...h, chemical: { ...h.chemical, F: f, ...ft }, tEnd: 10 * YEAR };
}
const satTransport: Transport = { ...at123d, source: waterTableSource(10, 10, { thickness: 3 }) };
const twoRegion = (): Chain =>
  saturatedChain({
    times,
    transport: satTransport,
    stepLength: STEP,
    method: 'two-region',
    makeInput: satInput,
  });
const exponential = (): Chain =>
  saturatedChain({
    times,
    transport: satTransport,
    stepLength: STEP,
    method: 'exponential',
    makeInput: satInput,
  });

const peak = (chain: Chain, c: number): number => {
  const spec = chain.epc(c);
  if (spec.kind !== 'series') throw new Error('series expected');
  return wellConcentrationMetric(spec.series);
};

const MCL = 5e-6; // kg/m^3 (0.005 mg/L)
const one = (chain: Chain, over: Partial<ChainChemical<ModernChemical>> = {}) =>
  ({ id: 'benzene', chemical: benzene, chain, ...over }) as ChainChemical<ModernChemical>;

function concentrationLevel(chain: Chain, window = 0) {
  return solveModeled({
    evaluate: modern,
    pathways: WATER,
    chemicals: [one(chain, { concentrationTarget: { kind: 'mcl' }, mcl: { value: MCL } })],
    averagingWindow: window,
  });
}

// ---------------------------------------------------------------- tests

describe('dissolved source chains: MCL target at the well', () => {
  for (const [name, t] of [
    ['at123d', at123d],
    ['wexler', wexler],
    ['domenico', domenico],
  ] as const) {
    it(`${name}: linear shortcut, round trip (a) and shortcut equals Brent (b)`, () => {
      const chain = dissolved(t);
      const r = concentrationLevel(chain);
      const lv = r.levels[0]!;
      expect(lv.limiting).toBe('concentration');
      expect(lv.solves.concentration!.method).toBe('linear');
      expect(lv.solves.concentration!.evaluations).toBe(2);
      expect(rel(peak(chain, lv.level!), MCL)).toBeLessThan(1e-9);
      // forced Brent on the same metric agrees
      const forced = solveModeledForced(chain);
      expect(rel(lv.level!, forced)).toBeLessThan(1e-10);
    });

    it(`${name}: the well peak is monotone in the source concentration (f)`, () => {
      const chain = dissolved(t);
      let prev = 0;
      for (let k = 0; k < 40; k++) {
        const c = 1e-9 * 10 ** ((k * 10) / 39);
        const p = peak(chain, c);
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    });
  }

  it('a longer averaging window lowers the metric, so raises the level', () => {
    const chain = dissolved(at123d);
    const peakLevel = concentrationLevel(chain).levels[0]!.level!;
    const avgLevel = concentrationLevel(chain, 5 * YEAR).levels[0]!.level!;
    expect(avgLevel).toBeGreaterThan(peakLevel);
    // and the windowed round trip holds
    const spec = chain.epc(avgLevel);
    if (spec.kind !== 'series') throw new Error('series');
    expect(rel(wellConcentrationMetric(spec.series, 5 * YEAR), MCL)).toBeLessThan(1e-9);
  });

  it('caps at the solubility and reports not reachable above it', () => {
    const chain = dissolvedChain({ times, transport: at123d, cap: 1e-9 });
    const r = concentrationLevel(chain);
    expect(r.levels[0]!.level).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.target-not-reachable');
  });

  it('a missing MCL keeps the risk targets and warns', () => {
    const chain = dissolved(at123d);
    const r = solveModeled({
      evaluate: modern,
      pathways: WATER,
      chemicals: [one(chain, { concentrationTarget: { kind: 'mcl' } })],
    });
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.mcl-missing');
    expect(r.levels[0]!.limiting).toBe('cancer');
  });

  it('refuses concentration targets with cumulative allocation', () => {
    expect(() =>
      solveModeled({
        evaluate: modern,
        pathways: WATER,
        allocation: 'cumulative',
        chemicals: [
          one(dissolved(at123d), {
            entered: 1e-3,
            concentrationTarget: { kind: 'user', value: MCL },
          }),
        ],
      }),
    ).toThrow(RangeError);
  });
});

function solveModeledForced(chain: Chain): number {
  const r = solveModeledDirect(chain);
  return r;
}
import { solveSourceLevel } from '../src/processes/cleanup/solve.js';
function solveModeledDirect(chain: Chain): number {
  const s = solveSourceLevel({
    metric: (c) => peak(chain, c),
    target: MCL,
    reference: chain.reference,
    cap: chain.cap,
    skipShortcut: true,
  });
  expect(s.method).toBe('brent');
  return s.level!;
}

describe('risk targets through the dissolved chain', () => {
  it('(a) the level fed forward meets the limiting endpoint, the other is at or below', () => {
    const chain = dissolved(at123d);
    const r = solveModeled({ evaluate: modern, pathways: WATER, chemicals: [one(chain)] });
    const lv = r.levels[0]!;
    expect(lv.level).not.toBeNull();
    const epcs = { waterIngestion: chain.epc(lv.level!), waterDermal: chain.epc(lv.level!) };
    const m = modern([{ id: 'benzene', chemical: benzene, epcs }]);
    if (lv.limiting === 'cancer') {
      expect(rel(m.cancer, 1e-6)).toBeLessThan(1e-9);
      expect(m.hi).toBeLessThanOrEqual(1 * (1 + 1e-9));
    } else {
      expect(rel(m.hi, 1)).toBeLessThan(1e-9);
      expect(m.cancer).toBeLessThanOrEqual(1e-6 * (1 + 1e-9));
    }
  });

  it('works for the legacy method with the same chain', () => {
    const adult = legacyReceptor({ ...LEGACY_PRESETS.residentAdultOnly });
    const legacy = legacyEvaluator([{ label: 'adult', receptor: adult, pathways: WATER }]);
    const chain = dissolved(at123d);
    const r = solveModeled<LegacyChemical>({
      evaluate: legacy,
      pathways: WATER,
      chemicals: [{ id: 'benzene', chemical: legacyBenzene, chain }],
    });
    const lv = r.levels[0]!;
    const epcs = { waterIngestion: chain.epc(lv.level!), waterDermal: chain.epc(lv.level!) };
    const m = legacy([{ id: 'benzene', chemical: legacyBenzene, epcs }]);
    const target = lv.limiting === 'cancer' ? 1e-6 : 1;
    expect(rel(lv.limiting === 'cancer' ? m.cancer : m.hi, target)).toBeLessThan(1e-9);
  });

  it('equal allocation divides the targets and keeps the single-chemical identity (g)', () => {
    const chain = dissolved(at123d);
    const ind = solveModeled({ evaluate: modern, pathways: WATER, chemicals: [one(chain)] });
    const eq = solveModeled({
      evaluate: modern,
      pathways: WATER,
      allocation: 'equal',
      chemicals: [one(chain)],
    });
    expect(rel(eq.levels[0]!.level!, ind.levels[0]!.level!)).toBeLessThan(1e-12);
  });
});

describe('cumulative scaling of two modeled chemicals (d)', () => {
  it('keeps the entered ratios and meets the target', () => {
    const chain = dissolved(at123d);
    const chems: ChainChemical<ModernChemical>[] = [
      { id: 'benzene', chemical: benzene, chain, entered: 1e-3 },
      { id: 'bap', chemical: bap, chain, entered: 2e-4 },
    ];
    const r = solveModeled({
      evaluate: modern,
      pathways: WATER,
      allocation: 'cumulative',
      chemicals: chems,
    });
    const [b, p] = r.levels;
    expect(rel(b!.level! / p!.level!, 5)).toBeLessThan(1e-12);
    const m = modern(
      chems.map((c, i) => {
        const conc = r.levels[i]!.level!;
        return {
          id: c.id,
          chemical: c.chemical,
          epcs: { waterIngestion: chain.epc(conc), waterDermal: chain.epc(conc) },
        };
      }),
    );
    const target = r.scaleLimiting === 'cancer' ? 1e-6 : 1;
    expect(rel(r.scaleLimiting === 'cancer' ? m.cancer : m.hi, target)).toBeLessThan(1e-9);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.hi-unsegregated');
  });

  it('needs entered concentrations', () => {
    expect(() =>
      solveModeled({
        evaluate: modern,
        pathways: WATER,
        allocation: 'cumulative',
        chemicals: [one(dissolved(at123d))],
      }),
    ).toThrow(RangeError);
  });
});

describe('soil source chains', () => {
  it('VADSAT without a separate phase is linear in F (b) and rounds trip (a)', () => {
    const chain = vadsatPlain();
    const r = concentrationLevel(chain);
    const s = r.levels[0]!.solves.concentration!;
    expect(s.reachable).toBe(true);
    expect(s.method).toBe('linear');
    expect(rel(peak(chain, r.levels[0]!.level!), MCL)).toBeLessThan(1e-9);
  }, 120000);

  it('VADSAT is monotone in F with and without a separate phase (f)', () => {
    for (const chain of [vadsatPlain(), vadsatResidual()]) {
      let prev = 0;
      for (let k = 0; k < 14; k++) {
        const f = 1e-12 * 10 ** k; // 1e-6 mg/kg ... 1e1 kg/kg-ish, ceiling handled by the cap below
        if (chain.cap !== undefined && f > chain.cap) break;
        const p = peak(chain, f);
        expect(p).toBeGreaterThanOrEqual(prev * (1 - 1e-12));
        prev = p;
      }
    }
  }, 120000);

  const userTarget = (
    chain: Chain,
    value: number,
    over: Partial<ChainChemical<ModernChemical>> = {},
  ) =>
    solveModeled({
      evaluate: modern,
      pathways: WATER,
      chemicals: [one(chain, { concentrationTarget: { kind: 'user', value }, ...over })],
    });

  it('VADSAT with a separate phase is nonlinear: Brent round trip, TPH kept, implied TPH warned', () => {
    const chain = vadsatResidual();
    const r = userTarget(chain, 8.6e-5, { tph: { mode: 'kept', F0: 500e-6, FT0: 5000e-6 } });
    const lv = r.levels[0]!;
    expect(lv.solves.concentration!.method).toBe('brent');
    expect(lv.level!).toBeGreaterThan(1e-4);
    expect(lv.level!).toBeLessThan(1e-3);
    expect(rel(peak(chain, lv.level!), 8.6e-5)).toBeLessThan(1e-9);
    expect(rel(lv.impliedTph!, lv.level! * 10)).toBeLessThan(1e-12);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.implied-tph');
  }, 120000);

  it('VADSAT separate phase: a target above the plateau is not reachable (reported, not capped)', () => {
    const r = userTarget(vadsatResidual(), 1e-4);
    expect(r.levels[0]!.level).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.target-not-reachable');
  }, 120000);

  it('TPH held fixed: the search stops at the TPH fraction, and a target at the cap returns the cap', () => {
    const held = tphSource(500e-6, 5000e-6, 'held', { M: 0.078, MT: 0.1 });
    expect(rel(held.cap, 5000e-6 * 0.78)).toBeLessThan(1e-12);
    const chain = vadsatResidual(held);
    const atCap = peak(chain, held.cap);
    const r = userTarget(chain, atCap);
    expect(rel(r.levels[0]!.level!, held.cap)).toBeLessThan(1e-9);
    expect(r.levels[0]!.solves.concentration!.method).toBe('cap');
    expect(userTarget(chain, atCap * 1.5).levels[0]!.level).toBeNull();
  }, 120000);

  it('TPH held fixed caps the search at the TPH fraction', () => {
    const held = tphSource(500e-6, 5000e-6, 'held');
    expect(held.at(1e-3)).toEqual({ F: 1e-3, FT: 5000e-6 });
    expect(held.cap).toBe(5000e-6);
    expect(tphKept.at(1e-3)).toEqual({ F: 1e-3, FT: 1e-2 });
    expect(tphKept.cap).toBe(1);
  });

  it('linked soil pathways add the direct soil terms to the metric', () => {
    const chain = vadsatPlain();
    const water = solveModeled({ evaluate: modern, pathways: WATER, chemicals: [one(chain)] });
    const linked = solveModeled({
      evaluate: modernEvaluator([
        { label: 'r', receptor: resident, pathways: [...WATER, 'soilIngestion', 'soilDermal'] },
      ]),
      pathways: [...WATER, 'soilIngestion', 'soilDermal'],
      chemicals: [one(chain)],
    });
    expect(linked.levels[0]!.level!).toBeLessThan(water.levels[0]!.level!);
    // a soil pathway switched on without a link to the source has no EPC: refused
    expect(() =>
      solveModeled({
        evaluate: modernEvaluator([
          { label: 'r', receptor: resident, pathways: [...WATER, 'soilIngestion', 'soilDermal'] },
        ]),
        pathways: [...WATER, 'soilIngestion', 'soilDermal'],
        chemicals: [one(chain, { linkedSoil: false })],
      }),
    ).toThrow(RangeError);
  }, 120000);

  for (const [name, make] of [
    ['two-region', twoRegion],
    ['exponential', exponential],
  ] as const) {
    it(`saturated ${name}: monotone, MCL round trip, and a separate-phase nonlinear case (a, f)`, () => {
      const chain = make();
      let prev = 0;
      for (let k = 0; k < 8; k++) {
        const p = peak(chain, 1e-9 * 10 ** k);
        expect(p).toBeGreaterThanOrEqual(prev * (1 - 1e-12));
        prev = p;
      }
      const lv = concentrationLevel(chain).levels[0]!;
      expect(lv.level).not.toBeNull();
      expect(rel(peak(chain, lv.level!), MCL)).toBeLessThan(1e-9);
      if (name === 'two-region') {
        const hi = userTarget(chain, 0.02).levels[0]!;
        expect(hi.solves.concentration!.method).toBe('brent');
        expect(rel(peak(chain, hi.level!), 0.02)).toBeLessThan(1e-9);
        expect(userTarget(chain, 0.05).levels[0]!.level).toBeNull();
      }
    }, 120000);
  }
});

describe('layered chain (numerical)', () => {
  const loam = { thetaS: 0.4, thetaR: 0.05, n: 1.6, Ks: 0.25 / DAY, rhoB: 1600, foc: 0.004 };
  const sand = { thetaS: 0.35, thetaR: 0.03, n: 2.7, Ks: 3 / DAY, rhoB: 1700, foc: 0.002 };
  const layeredInput = (f: number): LayeredInput => ({
    q: 0.2 / YEAR,
    above: [{ ...loam, thickness: 1.5 }],
    source: { ...loam, thickness: 1, length: 10, width: 8, F: f },
    below: [
      { ...loam, thickness: 2 },
      { ...sand, thickness: 2 },
    ],
    chemical: benzeneVadose,
    duration: 10 * YEAR,
  });

  it('(h) round trip holds to 1e-3 and the chain is flagged numerical', () => {
    const chain = layeredChain({ ...base, makeInput: layeredInput });
    const r = concentrationLevel(chain);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('cleanup.numerical-chain');
    const lv = r.levels[0]!;
    if (lv.level !== null) {
      expect(rel(peak(chain, lv.level), MCL)).toBeLessThan(1e-3);
    } else {
      expect(codes).toContain('cleanup.target-not-reachable');
    }
  }, 300000);
});

describe('screen-facing helpers (slice W2)', () => {
  it('a wexler transport honours vertical bounds: the no-flux water table keeps mass in the aquifer', () => {
    const open = dissolved({ ...wexler, bounds: undefined } as Transport);
    const bounded = dissolved({ ...wexler, bounds: { waterTable: 3 } } as Transport);
    const a = peak(open, 1e-3);
    const b = peak(bounded, 1e-3);
    expect(b).toBeGreaterThan(0);
    expect(b).not.toBe(a);
  });

  it('evaluateModeled gives the same metrics the solver inverts (round trip at the level)', () => {
    const chain = dissolved(at123d);
    const input = {
      evaluate: modern,
      pathways: WATER,
      chemicals: [
        one(chain, { concentrationTarget: { kind: 'mcl' as const }, mcl: { value: MCL } }),
      ],
    };
    const r = solveModeled(input);
    const level = r.levels[0]!.level!;
    const m = evaluateModeled(input, 0, level);
    expect(rel(m.peak!, MCL)).toBeLessThan(1e-9);
    expect(m.cancer).toBeGreaterThanOrEqual(0);
    expect(m.hi).toBeGreaterThanOrEqual(0);
    expect(evaluateModeled(input, 0, level * 2).peak!).toBeGreaterThan(m.peak!);
  });
});
