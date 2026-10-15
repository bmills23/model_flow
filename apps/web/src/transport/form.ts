import {
  convert,
  gelhar1985Api1987,
  xuEckstein1995,
  dispersionCoefficients,
  type Warning,
} from '@model-flow/engine';

/** One row of the stepped-loading table (years since release start; factor times the base rate). */
export interface StepRow {
  start: string;
  end: string;
  factor: string;
}

/**
 * Form state in RISC-style user units. Every numeric field is kept as the typed string so that
 * partial input ("1.") never fights the cursor; toScenario parses and validates at the boundary.
 */
export interface TransportForm {
  // aquifer
  aquiferMode: 'darcy' | 'velocity';
  K: string; // m/d
  gradient: string; // m/m
  velocityYr: string; // m/yr
  porosity: string;
  thicknessMode: 'infinite' | 'finite';
  thickness: string; // m
  width: string; // m, finite aquifer width for PATCHF; blank = infinite
  retardMode: 'factor' | 'kd';
  retardation: string;
  kd: string; // L/kg
  bulkDensity: string; // kg/L
  halfLifeYr: string; // years; blank or 0 = no decay
  // source
  srcLength: string; // m, along flow
  srcWidth: string; // m, across flow
  srcDepth: string; // m, thickness below the water table
  sourceMode: 'concentration' | 'massRate';
  c0: string; // mg/L
  massRate: string; // g/d
  loading: 'continuous' | 'pulse' | 'steps';
  pulseYr: string;
  steps: StepRow[];
  // dispersivity
  dispLaw: 'legacy' | 'modern';
  alphaLOverride: string;
  alphaTOverride: string;
  alphaVOverride: string;
  // receptor
  rx: string;
  ry: string;
  rDepth: string;
  screen: boolean;
  screenTop: string;
  screenBottom: string;
  // evaluation
  timeYr: string;
  xMin: string;
  xMax: string;
  yHalf: string;
  // methods and display
  mapMethod: 'legacy' | 'modern';
  showDomenico: boolean;
  scale: 'linear' | 'log';
}

/** BIOSCREEN-class example: sandy aquifer, K 10^-2 cm/s, gradient 0.003, porosity 0.25. */
export const DEFAULT_FORM: TransportForm = {
  aquiferMode: 'darcy',
  K: '8.64',
  gradient: '0.003',
  velocityYr: '37.9',
  porosity: '0.25',
  thicknessMode: 'infinite',
  thickness: '10',
  width: '',
  retardMode: 'factor',
  retardation: '2',
  kd: '0.1',
  bulkDensity: '1.7',
  halfLifeYr: '10',
  srcLength: '15',
  srcWidth: '20',
  srcDepth: '3',
  sourceMode: 'concentration',
  c0: '10',
  massRate: '100',
  loading: 'continuous',
  pulseYr: '5',
  steps: [
    { start: '0', end: '5', factor: '1' },
    { start: '8', end: '12', factor: '0.5' },
  ],
  dispLaw: 'legacy',
  alphaLOverride: '',
  alphaTOverride: '',
  alphaVOverride: '',
  rx: '100',
  ry: '0',
  rDepth: '1.5',
  screen: false,
  screenTop: '0.5',
  screenBottom: '2.5',
  timeYr: '15',
  xMin: '-20',
  xMax: '250',
  yHalf: '50',
  mapMethod: 'legacy',
  showDomenico: false,
  scale: 'linear',
};

export interface LoadingTerm {
  start: number;
  end: number;
  factor: number;
}

/** The form converted to SI (m, s, kg) with the engine inputs' shared pieces resolved. */
export interface Scenario {
  velocity: number;
  porosity: number;
  retardation: number;
  decayRate: number;
  alphaL: number;
  alphaT: number;
  alphaV: number;
  dx: number;
  dy: number;
  dz: number;
  /** Aquifer thickness; undefined = infinitely deep. */
  thickness?: number | undefined;
  /** Aquifer width for PATCHF; undefined = infinite. */
  width?: number | undefined;
  source: { x1: number; x2: number; y1: number; y2: number; z1: number; z2: number };
  srcLength: number;
  srcWidth: number;
  srcDepth: number;
  /** Concentration held (Wexler, Domenico), kg/m3. */
  c0: number;
  /** Mass release rate (AT123D), kg/s. */
  massRate: number;
  terms: LoadingTerm[];
  receptor: { x: number; y: number };
  /** Receptor depths below the water table; top = bottom for a point. */
  receptorDepths: { top: number; bottom: number };
  /** Engine z coordinate (from the aquifer base when finite) for a depth below the water table. */
  zOf: (depth: number) => number;
  time: number;
  extent: { xMin: number; xMax: number; yHalf: number };
  /** Labels and values for display. */
  dispersivityDistance: number;
  dispLaw: 'legacy' | 'modern';
  notes: Warning[];
}

export type ScenarioResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: string[] };

const YR = convert(1, 'yr', 's');

function num(s: string): number {
  return s.trim() === '' ? NaN : Number(s);
}

export function toScenario(f: TransportForm): ScenarioResult {
  const errors: string[] = [];
  const need = (label: string, s: string, test: (v: number) => boolean, hint: string): number => {
    const v = num(s);
    if (!Number.isFinite(v) || !test(v)) {
      errors.push(`${label} ${hint}`);
      return NaN;
    }
    return v;
  };
  const pos = (v: number) => v > 0;
  const nonneg = (v: number) => v >= 0;

  const porosity = need('Porosity', f.porosity, (v) => v > 0 && v < 1, 'must be between 0 and 1.');
  let velocity = NaN;
  if (f.aquiferMode === 'darcy') {
    const k = need('Hydraulic conductivity', f.K, pos, 'must be a positive number (m/d).');
    const i = need('Hydraulic gradient', f.gradient, pos, 'must be a positive number.');
    velocity = (convert(k, 'm/d', 'm/s') * i) / porosity;
  } else {
    velocity = convert(
      need('Seepage velocity', f.velocityYr, pos, 'must be a positive number (m/yr).'),
      'm/yr',
      'm/s',
    );
  }

  let thickness: number | undefined;
  if (f.thicknessMode === 'finite') {
    thickness = need('Aquifer thickness', f.thickness, pos, 'must be a positive number (m).');
  }
  let width: number | undefined;
  if (f.thicknessMode === 'finite' && f.width.trim() !== '') {
    width = need('Aquifer width', f.width, pos, 'must be a positive number (m) or blank.');
  }

  let retardation = 1;
  if (f.retardMode === 'factor') {
    retardation = need('Retardation factor', f.retardation, (v) => v >= 1, 'must be 1 or more.');
  } else {
    const kd = need('Kd', f.kd, nonneg, 'must be zero or more (L/kg).');
    const rho = need('Bulk density', f.bulkDensity, pos, 'must be positive (kg/L).');
    retardation = 1 + (rho * kd) / porosity;
  }

  let halfLife = 0;
  if (f.halfLifeYr.trim() !== '') halfLife = need('Half-life', f.halfLifeYr, nonneg, 'must be zero or more (years).');
  const decayRate = halfLife > 0 ? Math.LN2 / (halfLife * YR) : 0;

  const srcLength = need('Source length', f.srcLength, nonneg, 'must be zero or more (m).');
  const srcWidth = need('Source width', f.srcWidth, pos, 'must be a positive number (m).');
  const srcDepth = need('Source thickness', f.srcDepth, pos, 'must be a positive number (m).');
  if (thickness !== undefined && srcDepth > thickness) {
    errors.push('Source thickness cannot exceed the aquifer thickness.');
  }
  if (width !== undefined && srcWidth > width) {
    errors.push('Source width cannot exceed the aquifer width.');
  }

  const darcy = velocity * porosity;
  const area = srcWidth * srcDepth;
  let c0 = NaN;
  let massRate = NaN;
  if (f.sourceMode === 'concentration') {
    c0 = convert(need('Source concentration', f.c0, nonneg, 'must be zero or more (mg/L).'), 'mg/L', 'kg/m3');
    massRate = c0 * darcy * area;
  } else {
    massRate = convert(need('Mass rate', f.massRate, nonneg, 'must be zero or more (g/d).'), 'g/d', 'kg/s');
    c0 = massRate / (darcy * area);
  }

  const terms: LoadingTerm[] = [];
  if (f.loading === 'continuous') {
    terms.push({ start: 0, end: Infinity, factor: 1 });
  } else if (f.loading === 'pulse') {
    const d = need('Pulse duration', f.pulseYr, pos, 'must be a positive number (years).');
    terms.push({ start: 0, end: d * YR, factor: 1 });
  } else {
    if (f.steps.length === 0) errors.push('Add at least one loading step.');
    f.steps.forEach((row, k) => {
      const label = `Step ${k + 1}`;
      const a = need(`${label} start`, row.start, nonneg, 'must be zero or more (years).');
      const b = need(`${label} end`, row.end, nonneg, 'must be zero or more (years).');
      const fac = need(`${label} factor`, row.factor, nonneg, 'must be zero or more.');
      if (Number.isFinite(a) && Number.isFinite(b) && !(b > a)) errors.push(`${label} must end after it starts.`);
      terms.push({ start: a * YR, end: b * YR, factor: fac });
    });
  }

  const rx = need('Receptor x', f.rx, Number.isFinite, 'must be a number (m).');
  const ry = need('Receptor y', f.ry, Number.isFinite, 'must be a number (m).');
  let top: number;
  let bottom: number;
  if (f.screen) {
    top = need('Screen top', f.screenTop, nonneg, 'must be zero or more (m below the water table).');
    bottom = need('Screen bottom', f.screenBottom, nonneg, 'must be zero or more (m below the water table).');
    if (Number.isFinite(top) && Number.isFinite(bottom) && !(bottom > top)) {
      errors.push('Screen bottom must be below its top.');
    }
  } else {
    top = bottom = need('Receptor depth', f.rDepth, nonneg, 'must be zero or more (m below the water table).');
  }
  if (thickness !== undefined && Number.isFinite(bottom) && bottom > thickness) {
    errors.push('The receptor depth is below the base of the aquifer.');
  }

  const time = need('Evaluation time', f.timeYr, pos, 'must be a positive number (years).') * YR;
  const xMin = need('Map x min', f.xMin, Number.isFinite, 'must be a number (m).');
  const xMax = need('Map x max', f.xMax, Number.isFinite, 'must be a number (m).');
  const yHalf = need('Map half-width', f.yHalf, pos, 'must be a positive number (m).');
  if (Number.isFinite(xMin) && Number.isFinite(xMax) && !(xMax > xMin)) {
    errors.push('Map x max must be greater than x min.');
  }

  // dispersivity: the law's values, each replaceable by an override
  const distance = Number.isFinite(rx) && rx > 0 ? rx : Number.isFinite(xMax) && xMax > 0 ? xMax : 1;
  const law = f.dispLaw === 'legacy' ? gelhar1985Api1987 : xuEckstein1995;
  const lawOut = law.run({ distance });
  const notes: Warning[] = [...(law.validate?.({ distance }) ?? [])];
  const over = (label: string, s: string, fallback: number): number =>
    s.trim() === '' ? fallback : need(label, s, nonneg, 'must be zero or more (m).');
  const alphaL = over('Longitudinal dispersivity', f.alphaLOverride, lawOut.alphaL);
  const alphaT = over('Transverse dispersivity', f.alphaTOverride, lawOut.alphaT);
  const alphaV = over('Vertical dispersivity', f.alphaVOverride, lawOut.alphaV);

  if (errors.length > 0) return { ok: false, errors };

  const { dx, dy, dz } = dispersionCoefficients({ alphaL, alphaT, alphaV, velocity });
  const zOf = (depth: number): number => (thickness === undefined ? -depth : thickness - depth);
  const z1 = zOf(srcDepth);
  const z2 = zOf(0);
  return {
    ok: true,
    scenario: {
      velocity,
      porosity,
      retardation,
      decayRate,
      alphaL,
      alphaT,
      alphaV,
      dx,
      dy,
      dz,
      thickness,
      width,
      source: { x1: -srcLength, x2: 0, y1: -srcWidth / 2, y2: srcWidth / 2, z1: Math.min(z1, z2), z2: Math.max(z1, z2) },
      srcLength,
      srcWidth,
      srcDepth,
      c0,
      massRate,
      terms,
      receptor: { x: rx, y: ry },
      receptorDepths: { top, bottom },
      zOf,
      time,
      extent: { xMin, xMax, yHalf },
      dispersivityDistance: distance,
      dispLaw: f.dispLaw,
      notes,
    },
  };
}
