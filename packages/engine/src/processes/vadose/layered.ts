/**
 * Finite-volume solver for leachate transport through a layered unsaturated column under steady
 * unit-gradient flow, SI units. Depth x is measured down from the base of the source.
 *
 *   theta R dC/dt = -dF/dx - mu theta C,   F = q C - theta D dC/dx,
 *
 * with layer-wise constant theta, R and D and a flux-type inlet F(0, t) = q C_s(t). The water-table
 * flux is the total flux F across the water-table face. To make it the flux of a column that
 * continues below the water table (the semi-infinite convention of the analytic solutions, so one
 * layer and several identical layers give the same answer), the deepest layer is extended by a
 * buffer of `outletBuffer` dispersion lengths D/v (default 20) that ends in a free exit (zero
 * dispersive flux, F = q C). The free exit perturbs the solution upstream by about
 * exp(-outletBuffer), 2e-9 at the default. Mass that crosses the water-table face counts as
 * delivered; the buffer is not part of the profile or the budget. With `outletBuffer: 0` the free
 * exit sits at the water table itself. Cells are cell-centred and never
 * straddle a layer interface. Interface dispersive conductances are harmonic in theta D (series
 * resistances of the two half cells); advection uses distance-weighted central interpolation,
 * which stays monotone because every cell Peclet number q dx / (theta D) is kept at or below
 * `maxPeclet` (default 2) with at least 20 cells per layer. That starting grid is coarse for
 * accuracy (the scheme is second order, and a few cells per spreading width leave errors of a few
 * percent of the peak flux), so after the time step is settled every cell is halved until halving
 * changes the results by less than `grid.tolerance` (default 1e-3) of their peak. Time stepping is
 * Crank-Nicolson, with the first two steps backward
 * Euler to damp the start-up step (Rannacher smoothing). The inflow over each step is the exact
 * integral of the inlet flux, so the column receives exactly the mass the source loses by
 * leaching. Stored, decayed and outflow masses are accumulated with the same time weights as the
 * scheme, so the discrete budget closes to round-off.
 */

export interface FvLayer {
  /** Thickness, m. */
  thickness: number;
  /** Volumetric water content. */
  theta: number;
  /** Retardation factor. */
  R: number;
  /** Pore-water dispersion coefficient (mechanical plus diffusion), m^2/s. */
  D: number;
}

export interface FvGridOptions {
  /** Largest cell Peclet number q dx / (theta D) (default 2). */
  maxPeclet?: number;
  /** Smallest number of cells in any layer (default 20). */
  minCellsPerLayer?: number;
  /** Largest total number of cells before the problem is rejected (default 20000). */
  maxCells?: number;
  /**
   * After the time step is settled, halve every cell until doing so changes the water-table flux
   * (and every profile value) by less than this fraction of its peak (default 1e-3; 0 keeps the
   * starting grid).
   */
  tolerance?: number;
  /** Largest number of grid halvings (default 6). */
  maxRefinements?: number;
}

export interface FvTimeOptions {
  /**
   * Accept a step size when halving it changes the water-table flux at every output time by less than
   * this fraction of its peak, and likewise every profile value as a fraction of the
   * peak profile value (default 1e-4). Peaks below 1e-9 of the initial inlet concentration are
   * treated as that floor, so a front that has not reached the water table does not force refinement.
   */
  tolerance?: number;
  /** Largest number of halvings (default 12). */
  maxRefinements?: number;
  /** Starting step, s (default: one cell transit time q dx / (theta R) of the fastest cell). */
  initialStep?: number;
  /** Use this step and skip the refinement loop. */
  fixedStep?: number;
}

export interface FvProblem {
  /** Darcy flux, m/s (> 0). */
  q: number;
  /** First-order decay rate of the dissolved phase, 1/s. */
  mu: number;
  /** Layers from the base of the source down to the water table. */
  layers: readonly FvLayer[];
  /** Mass entering per unit area during [t0, t1], kg/m^2 (the integral of q C_s). */
  inflow(t0: number, t1: number): number;
  /** Inlet concentration C_s(t), kg/m^3, used only to report the inlet-face concentration. */
  inletConcentration(t: number): number;
  /** Output times, s, ascending and starting at 0. */
  times: readonly number[];
  /** Depths for the profiles, m, within [0, column length]. */
  depths?: readonly number[];
  /** Profile times, s. */
  profileTimes?: readonly number[];
  grid?: FvGridOptions;
  time?: FvTimeOptions;
  /**
   * Buffer below the water table, in dispersion lengths D/v of the deepest layer (default 20);
   * 0 places the free exit at the water table.
   */
  outletBuffer?: number;
}

export interface FvResult {
  /** Cells above the water table and the cell size in each layer, m (buffer excluded). */
  cells: number;
  dx: number[];
  gridRefinements: number;
  /** Last grid-halving change, as a fraction of the peak (0 when the grid was not refined). */
  gridChange: number;
  gridConverged: boolean;
  /** Step size used (the largest substep), s. */
  timeStep: number;
  refinements: number;
  converged: boolean;
  /** Last refinement change, as a fraction of the peak (0 with a fixed step). */
  stepChange: number;
  times: number[];
  /** Pore-water concentration at the water-table face, kg/m^3. */
  waterTableConcentration: number[];
  /** Total (advective plus dispersive) flux across the water-table face, kg/m^2/s. */
  waterTableFlux: number[];
  /** Cumulative masses per unit area at the output times, kg/m^2. */
  inflow: number[];
  outflow: number[];
  decayed: number[];
  stored: number[];
  /** Largest |inflow - outflow - decayed - stored| / inflow over the output times. */
  closureError: number;
  /** profiles[profileTime][depth], kg/m^3. */
  profiles: number[][];
}

interface Grid {
  /** All cells, including the buffer. */
  n: number;
  /** Cells above the water table. */
  nCol: number;
  /** Water-table face weights: F = q (fa C_i + fb C_i+1) - fG (C_i+1 - C_i), i = nCol - 1. */
  fa: number;
  fb: number;
  fG: number;
  dx: Float64Array;
  centre: Float64Array;
  theta: Float64Array;
  /** theta R dx: storage per unit concentration. */
  store: Float64Array;
  /** mu theta dx: decay per unit concentration. */
  decay: Float64Array;
  /** Tridiagonal operator K: lower[i] couples i to i-1, upper[i] couples i to i+1. */
  lower: Float64Array;
  diag: Float64Array;
  upper: Float64Array;
  layerDx: number[];
  length: number;
  /** 2 theta D / dx of the first cell (inlet half-cell conductance). */
  inletConductance: number;
}

/** Concentrations below this magnitude (kg/m^3) are set to zero after each step. */
const TINY = 1e-250;

function fin(name: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite, got ${x}`);
}

/** Grid at refinement `factor` (cells per layer multiplied by it); null past maxCells. */
function buildGrid(p: FvProblem, factor = 1): Grid | null {
  const maxPe = p.grid?.maxPeclet ?? 2;
  const minCells = p.grid?.minCellsPerLayer ?? 20;
  const maxCells = p.grid?.maxCells ?? 20000;
  if (!(maxPe > 0)) throw new RangeError('maxPeclet must be positive');
  if (!(Number.isInteger(minCells) && minCells >= 1)) {
    throw new RangeError('minCellsPerLayer must be a positive integer');
  }
  const buffer = p.outletBuffer ?? 20;
  if (!(buffer >= 0) || !Number.isFinite(buffer)) {
    throw new RangeError('outletBuffer must be finite and >= 0');
  }
  const last = p.layers[p.layers.length - 1]!;
  const all: FvLayer[] = [...p.layers];
  if (buffer > 0) all.push({ ...last, thickness: (buffer * last.theta * last.D) / p.q });
  const counts = all.map((l, j) => {
    const dxMax = (maxPe * l.theta * l.D) / p.q;
    const min = j < p.layers.length ? minCells : Math.min(minCells, 10);
    return factor * Math.max(min, Math.ceil(l.thickness / dxMax - 1e-9));
  });
  const nCol = counts.slice(0, p.layers.length).reduce((a, b) => a + b, 0);
  const n = counts.reduce((a, b) => a + b, 0);
  if (nCol > maxCells) {
    if (factor > 1) return null;
    throw new RangeError(
      `the column needs ${nCol} cells to keep the cell Peclet number at ${maxPe} (limit ${maxCells}); dispersion is too small for the column length`,
    );
  }
  const dx = new Float64Array(n);
  const centre = new Float64Array(n);
  const theta = new Float64Array(n);
  const store = new Float64Array(n);
  const decay = new Float64Array(n);
  const td = new Float64Array(n); // theta D
  const layerDx: number[] = [];
  let k = 0;
  let top = 0;
  let length = 0;
  all.forEach((l, j) => {
    const h = l.thickness / counts[j]!;
    if (j < p.layers.length) layerDx.push(h);
    for (let c = 0; c < counts[j]!; c++, k++) {
      dx[k] = h;
      centre[k] = top + (c + 0.5) * h;
      theta[k] = l.theta;
      store[k] = l.theta * l.R * h;
      decay[k] = p.mu * l.theta * h;
      td[k] = l.theta * l.D;
    }
    top += l.thickness;
    if (j < p.layers.length) length = top;
  });

  const lower = new Float64Array(n);
  const diag = new Float64Array(n);
  const upper = new Float64Array(n);
  const q = p.q;
  for (let i = 0; i + 1 < n; i++) {
    // face between cells i and i+1: F = q (a C_i + b C_i+1) - G (C_i+1 - C_i)
    const a = dx[i + 1]! / (dx[i]! + dx[i + 1]!);
    const b = 1 - a;
    const G = 1 / (dx[i]! / (2 * td[i]!) + dx[i + 1]! / (2 * td[i + 1]!));
    // cell i loses F, cell i+1 gains F
    diag[i] = diag[i]! - (q * a + G);
    upper[i] = upper[i]! - (q * b - G);
    lower[i + 1] = lower[i + 1]! + (q * a + G);
    diag[i + 1] = diag[i + 1]! + (q * b - G);
  }
  diag[n - 1] = diag[n - 1]! - q; // free exit: outflow q C_N
  for (let i = 0; i < n; i++) diag[i] = diag[i]! - decay[i]!;
  let fa = 1;
  let fb = 0;
  let fG = 0;
  if (n > nCol) {
    const i = nCol - 1;
    fa = dx[i + 1]! / (dx[i]! + dx[i + 1]!);
    fb = 1 - fa;
    fG = 1 / (dx[i]! / (2 * td[i]!) + dx[i + 1]! / (2 * td[i + 1]!));
  }
  return {
    n,
    nCol,
    fa,
    fb,
    fG,
    dx,
    centre,
    theta,
    store,
    decay,
    lower,
    diag,
    upper,
    layerDx,
    length,
    inletConductance: (2 * td[0]!) / dx[0]!,
  };
}

/** Sorted union of the output and profile times. */
function timeGrid(p: FvProblem): number[] {
  const all = [...p.times, ...(p.profileTimes ?? [])].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of all) {
    if (out.length === 0 || t > out[out.length - 1]! * (1 + 1e-14) + 1e-300) out.push(t);
  }
  return out;
}

interface RunOutput {
  waterTableConcentration: number[];
  waterTableFlux: number[];
  inflow: number[];
  outflow: number[];
  decayed: number[];
  stored: number[];
  profiles: number[][];
}

function concentrationAt(g: Grid, C: Float64Array, q: number, cs: number, x: number): number {
  const n = g.n;
  if (x <= g.centre[0]!) {
    // inlet face from the flux condition q C_s = q C_f - (2 theta D / dx)(C_1 - C_f)
    const cf = (q * cs + g.inletConductance * C[0]!) / (q + g.inletConductance);
    const w = x / g.centre[0]!;
    return cf + w * (C[0]! - cf);
  }
  if (x >= g.centre[n - 1]!) return C[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.centre[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const w = (x - g.centre[lo]!) / (g.centre[hi]! - g.centre[lo]!);
  return C[lo]! + w * (C[hi]! - C[lo]!);
}

function runOnce(p: FvProblem, g: Grid, levels: number[], dtMax: number): RunOutput {
  const n = g.n;
  const q = p.q;
  const C = new Float64Array(n);
  const rhs = new Float64Array(n);
  const cp = new Float64Array(n); // Thomas multipliers
  const lo = new Float64Array(n);
  const inv = new Float64Array(n);
  const { store, decay, lower, diag, upper } = g;
  let fdt = -1;
  let fw = -1;
  const outIndex = new Map<number, number>();
  p.times.forEach((t, k) => outIndex.set(t, k));
  const profIndex = new Map<number, number>();
  (p.profileTimes ?? []).forEach((t, k) => profIndex.set(t, k));
  const depths = p.depths ?? [];
  const nOut = p.times.length;
  const out: RunOutput = {
    waterTableConcentration: new Array<number>(nOut).fill(0),
    waterTableFlux: new Array<number>(nOut).fill(0),
    inflow: new Array<number>(nOut).fill(0),
    outflow: new Array<number>(nOut).fill(0),
    decayed: new Array<number>(nOut).fill(0),
    stored: new Array<number>(nOut).fill(0),
    profiles: (p.profileTimes ?? []).map(() => new Array<number>(depths.length).fill(0)),
  };
  let cumIn = 0;
  let cumOut = 0;
  let cumDecay = 0;
  let step = 0;
  const nCol = g.nCol;
  const iw = nCol - 1;
  const buffered = g.n > nCol;
  const faceC = (): number => (buffered ? g.fa * C[iw]! + g.fb * C[iw + 1]! : C[iw]!);
  const faceFlux = (): number =>
    buffered ? q * faceC() - g.fG * (C[iw + 1]! - C[iw]!) : q * C[iw]!;

  const record = (t: number): void => {
    const k = outIndex.get(t);
    if (k !== undefined) {
      let s = 0;
      for (let i = 0; i < nCol; i++) s += g.store[i]! * C[i]!;
      out.waterTableConcentration[k] = faceC();
      out.waterTableFlux[k] = faceFlux();
      out.inflow[k] = cumIn;
      out.outflow[k] = cumOut;
      out.decayed[k] = cumDecay;
      out.stored[k] = s;
    }
    const j = profIndex.get(t);
    if (j !== undefined) {
      const cs = p.inletConcentration(t);
      out.profiles[j] = depths.map((x) => concentrationAt(g, C, q, cs, x));
    }
  };
  record(levels[0]!);
  for (let L = 0; L + 1 < levels.length; L++) {
    const t0 = levels[L]!;
    const t1 = levels[L + 1]!;
    const m = Math.max(1, Math.ceil((t1 - t0) / dtMax - 1e-9));
    const h = (t1 - t0) / m;
    for (let s = 0; s < m; s++, step++) {
      const ta = t0 + s * h;
      const tb = s + 1 === m ? t1 : t0 + (s + 1) * h;
      const dt = tb - ta;
      const w = step < 2 ? 1 : 0.5;
      if (dt !== fdt || w !== fw) {
        // factor (store - w dt K) once per distinct step: lo, 1/pivot and the Thomas multipliers
        fdt = dt;
        fw = w;
        const wd = w * dt;
        let prevCp = 0;
        for (let i = 0; i < n; i++) {
          const l = i > 0 ? -wd * lower[i]! : 0;
          const u = i + 1 < n ? -wd * upper[i]! : 0;
          const piv = store[i]! - wd * diag[i]! - l * prevCp;
          lo[i] = l;
          inv[i] = 1 / piv;
          prevCp = u / piv;
          cp[i] = prevCp;
        }
      }
      const inMass = p.inflow(ta, tb);
      const fluxOld = faceFlux();
      let decOld = 0;
      for (let i = 0; i < nCol; i++) decOld += decay[i]! * C[i]!;
      // right-hand side store C + (1 - w) dt K C, then forward elimination
      const ex = (1 - w) * dt;
      let cm = 0; // C[i - 1]
      let ci = C[0]!;
      let prev = 0;
      let extra = inMass; // the inflow enters the first cell only
      for (let i = 0; i < n - 1; i++) {
        const cn = C[i + 1]!;
        const kc = lower[i]! * cm + diag[i]! * ci + upper[i]! * cn;
        prev = (store[i]! * ci + ex * kc + extra - lo[i]! * prev) * inv[i]!;
        extra = 0;
        rhs[i] = prev;
        cm = ci;
        ci = cn;
      }
      {
        const i = n - 1;
        const kc = lower[i]! * cm + diag[i]! * ci;
        prev = (store[i]! * ci + ex * kc + extra - lo[i]! * prev) * inv[i]!;
        rhs[i] = prev;
      }
      // Values below TINY are flushed to zero: far below the front the profile decays into the
      // subnormal range, where floating-point arithmetic is many times slower. The mass this
      // discards is below 1e-250 kg/m^3 per cell.
      const last = rhs[n - 1]!;
      C[n - 1] = Math.abs(last) < TINY ? 0 : last;
      for (let i = n - 2; i >= 0; i--) {
        const c = rhs[i]! - cp[i]! * C[i + 1]!;
        C[i] = Math.abs(c) < TINY ? 0 : c;
      }
      let decNew = 0;
      for (let i = 0; i < nCol; i++) decNew += decay[i]! * C[i]!;
      cumIn += inMass;
      cumOut += dt * (w * faceFlux() + (1 - w) * fluxOld);
      cumDecay += dt * (w * decNew + (1 - w) * decOld);
    }
    record(t1);
  }
  return out;
}

/** Largest |a - b| as a fraction of the peak |a| (peaks below `floor` count as `floor`). */
function relativeChange(a: readonly number[], b: readonly number[], floor: number): number {
  let peak = 0;
  let diff = 0;
  a.forEach((v, k) => {
    peak = Math.max(peak, Math.abs(v));
    diff = Math.max(diff, Math.abs(v - b[k]!));
  });
  const scale = Math.max(peak, floor);
  return scale > 0 ? diff / scale : 0;
}

/** Solve the layered column, refining the time step until the water-table flux settles. */
export function solveLayeredColumn(p: FvProblem): FvResult {
  fin('q', p.q);
  if (!(p.q > 0)) throw new RangeError(`q must be positive, got ${p.q}`);
  fin('mu', p.mu);
  if (p.mu < 0) throw new RangeError('mu must not be negative');
  if (p.layers.length === 0) throw new RangeError('at least one layer is needed');
  for (const l of p.layers) {
    for (const [k, v] of Object.entries(l)) {
      fin(k, v);
      if (!(v > 0)) throw new RangeError(`layer ${k} must be positive, got ${v}`);
    }
  }
  if (p.times.length === 0 || p.times[0] !== 0) throw new RangeError('times must start at 0');
  for (let k = 1; k < p.times.length; k++) {
    if (!(p.times[k]! > p.times[k - 1]!)) throw new RangeError('times must be ascending');
  }
  for (const t of p.profileTimes ?? []) {
    if (!(t >= 0) || !Number.isFinite(t)) throw new RangeError('profile times must be >= 0');
  }
  const g0 = buildGrid(p)!;
  for (const x of p.depths ?? []) {
    if (!(x >= 0 && x <= g0.length * (1 + 1e-12))) {
      throw new RangeError(`profile depth ${x} is outside the column [0, ${g0.length}]`);
    }
  }
  const levels = timeGrid(p);
  const span = levels[levels.length - 1]! - levels[0]!;
  let maxInterval = 0;
  for (let k = 1; k < levels.length; k++) {
    maxInterval = Math.max(maxInterval, levels[k]! - levels[k - 1]!);
  }
  // values below 1e-9 of the inlet concentration are treated as zero when normalising
  const floor = 1e-9 * Math.abs(p.inletConcentration(0));
  const change = (a: RunOutput, b: RunOutput): number =>
    Math.max(
      relativeChange(a.waterTableFlux, b.waterTableFlux, floor * p.q),
      relativeChange(a.profiles.flat(), b.profiles.flat(), floor),
    );

  // 1. time step on the starting grid
  let dt: number;
  let run: RunOutput;
  let refinements = 0;
  let converged = true;
  let stepChange = 0;
  if (span === 0) {
    dt = 0;
    run = runOnce(p, g0, levels, 1);
  } else if (p.time?.fixedStep !== undefined) {
    const h = p.time.fixedStep;
    if (!(h > 0) || !Number.isFinite(h)) throw new RangeError('fixedStep must be positive');
    dt = Math.min(h, maxInterval);
    run = runOnce(p, g0, levels, h);
  } else {
    const tol = p.time?.tolerance ?? 1e-4;
    const maxRef = p.time?.maxRefinements ?? 12;
    let transit = Infinity;
    for (let i = 0; i < g0.n; i++) transit = Math.min(transit, g0.store[i]! / p.q);
    dt = Math.min(p.time?.initialStep ?? transit, maxInterval);
    run = runOnce(p, g0, levels, dt);
    converged = false;
    stepChange = Infinity;
    for (let r = 1; r <= maxRef; r++) {
      dt /= 2;
      const next = runOnce(p, g0, levels, dt);
      stepChange = change(next, run);
      run = next;
      refinements = r;
      if (stepChange < tol) {
        converged = true;
        break;
      }
    }
  }

  // 2. grid halvings at that time step
  let g = g0;
  let gridRefinements = 0;
  let gridChange = 0;
  let gridConverged = true;
  const gridTol = p.grid?.tolerance ?? 1e-3;
  const maxGridRef = p.grid?.maxRefinements ?? 6;
  if (gridTol > 0 && span > 0) {
    gridConverged = false;
    for (let r = 1; r <= maxGridRef; r++) {
      const finer = buildGrid(p, 2 ** r);
      if (!finer) break;
      const next = runOnce(p, finer, levels, dt);
      gridChange = change(next, run);
      run = next;
      g = finer;
      gridRefinements = r;
      if (gridChange < gridTol) {
        gridConverged = true;
        break;
      }
    }
  }

  let closure = 0;
  run.inflow.forEach((m, k) => {
    if (!(m > 0)) return;
    const e = Math.abs(m - run.outflow[k]! - run.decayed[k]! - run.stored[k]!) / m;
    closure = Math.max(closure, e);
  });
  return {
    cells: g.nCol,
    dx: g.layerDx,
    gridRefinements,
    gridChange,
    gridConverged,
    timeStep: dt,
    refinements,
    converged,
    stepChange,
    times: [...p.times],
    waterTableConcentration: run.waterTableConcentration,
    waterTableFlux: run.waterTableFlux,
    inflow: run.inflow,
    outflow: run.outflow,
    decayed: run.decayed,
    stored: run.stored,
    closureError: closure,
    profiles: run.profiles,
  };
}
