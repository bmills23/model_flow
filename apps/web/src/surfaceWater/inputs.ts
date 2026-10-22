import type { BankFeed } from '../transport/bankFeed';

/**
 * Form state in RISC-style user units (m, m^3/d, mg/L, 1/d, L/kg) kept as typed strings, and the
 * conversion to the SI request the engine takes. Conversions happen only here.
 */
export interface SwForm {
  bodyType: 'river' | 'lake';
  crossSection: string; // m^2 (river)
  volume: string; // m^3 (lake)
  upstreamFlow: string; // m^3/d
  background: string; // mg/L
  mixingFraction: string;
  decay: string; // 1/d
  // groundwater discharge
  dischargeMode: 'darcy' | 'flow';
  bedConductivity: string; // m/d
  gradient: string;
  flow: string; // m^3/d
  thickness: string; // m, discharge thickness d
  reachMode: 'entered' | 'domenico';
  reachLength: string; // m
  sourceWidth: string; // m, Domenico reach
  bankX: string; // m, source face to bank
  // groundwater concentration when no transport run is linked
  groundwaterConcentration: string; // mg/L
  durationYr: string;
  linked: boolean;
  /** The project chemical a run sent to risk or cleanup is for, when not linked to a bank run; blank = untagged. */
  chemicalId: string;
  // sediment
  sedimentOn: boolean;
  foc: string;
  koc: string; // L/kg
  kd: string; // L/kg
  poreWater: 'discharge' | 'centreline' | 'surface';
  // modern river receptor
  downstream: string; // m below the reach, blank = none
  solubility: string; // mg/L, blank = not checked
  scale: 'linear' | 'log';
}

/** Table R-8 river case: benzene, K_b 10 m/d, gradient 0.05, d 5 m, reach 100 m, Koc 59 mL/g from RISC4. */
export const DEFAULT_FORM: SwForm = {
  bodyType: 'river',
  crossSection: '5',
  volume: '100000',
  upstreamFlow: '180',
  background: '0',
  mixingFraction: '1',
  decay: '0',
  dischargeMode: 'darcy',
  bedConductivity: '10',
  gradient: '0.05',
  flow: '250',
  thickness: '5',
  reachMode: 'entered',
  reachLength: '100',
  sourceWidth: '',
  bankX: '',
  groundwaterConcentration: '5',
  durationYr: '10',
  linked: false,
  chemicalId: '',
  sedimentOn: true,
  foc: '0.01',
  koc: '59',
  kd: '',
  poreWater: 'discharge',
  downstream: '',
  solubility: '',
  scale: 'linear',
};

/** Table R-8 lake case: 100,000 m^3, mixing fraction 0.1, decay 0.005 per day. */
export const LAKE_FORM: SwForm = {
  ...DEFAULT_FORM,
  bodyType: 'lake',
  mixingFraction: '0.1',
  decay: '0.005',
};

/** Published Table R-8 values (review cited in the methods note). */
export const R8_PUBLISHED = {
  river: { surfaceMgPerL: 2.91, sedimentMgPerKg: 2.95, flowM3PerDay: 250, massGPerDay: 1250 },
  lake: { surfaceMgPerL: 3.93, sedimentMgPerKg: 2.95, flowM3PerDay: 250, massGPerDay: 1250 },
  /** Half a unit in the last printed digit. */
  surfaceTolerance: 0.005,
  sedimentTolerance: 0.005,
} as const;

const R8_KEYS: (keyof SwForm)[] = [
  'bodyType',
  'crossSection',
  'volume',
  'upstreamFlow',
  'background',
  'mixingFraction',
  'decay',
  'dischargeMode',
  'bedConductivity',
  'gradient',
  'flow',
  'thickness',
  'reachMode',
  'reachLength',
  'groundwaterConcentration',
  'linked',
  'sedimentOn',
  'foc',
  'koc',
  'kd',
  'downstream',
];

/** Whether the inputs are the R-8 river or lake case (only the fields that matter are compared). */
export function isR8Case(f: SwForm): 'river' | 'lake' | null {
  for (const base of [DEFAULT_FORM, LAKE_FORM]) {
    if (R8_KEYS.every((k) => f[k] === base[k])) return base.bodyType;
  }
  return null;
}

export type WireWaterBody =
  { type: 'river'; crossSection: number } | { type: 'lake'; volume: number };

export interface SwRequest {
  body: WireWaterBody;
  /** m^3/s */
  upstreamFlow: number;
  /** kg/m^3 */
  background: number;
  mixingFraction: number;
  /** 1/s */
  decay: number;
  reach: { kind: 'entered'; length: number } | { kind: 'domenico'; sourceWidth: number };
  discharge:
    | { kind: 'flow'; flow: number }
    | { kind: 'darcy'; bedConductivity: number; thickness: number; gradient: number };
  /** Discharge thickness d, m (the screen average and the bank plane), when given. */
  thickness?: number;
  /** Source face to the bank, m. */
  bankX?: number;
  /** kg/m^3, used when no run is linked. */
  groundwaterConcentration: number;
  /** s, the run length when no run is linked. */
  duration: number;
  sediment?: {
    fractionOrganicCarbon: number;
    /** m^3/kg */
    koc?: number;
    kd?: number;
    poreWater: 'discharge' | 'centreline' | 'surface';
  };
  /** m below the end of the reach. */
  downstream?: number;
  /** kg/m^3 */
  solubility?: number;
  link: BankFeed | null;
}

export type ParseResult = { ok: true; request: SwRequest } | { ok: false; errors: string[] };

const DAY = 86400;
const YEAR = 365.25 * DAY;

export function toRequest(f: SwForm, link: BankFeed | null): ParseResult {
  const errors: string[] = [];
  const parse = (s: string): number => (s.trim() === '' ? NaN : Number(s));
  const need = (label: string, s: string, ok: (x: number) => boolean, rule: string): number => {
    const x = parse(s);
    if (!Number.isFinite(x) || !ok(x)) {
      errors.push(`${label} ${rule}`);
      return NaN;
    }
    return x;
  };
  const pos = (x: number): boolean => x > 0;
  const nonneg = (x: number): boolean => x >= 0;
  const optional = (
    label: string,
    s: string,
    ok: (x: number) => boolean,
    rule: string,
  ): number | undefined => (s.trim() === '' ? undefined : need(label, s, ok, rule));

  const linked = f.linked && link !== null;
  const river = f.bodyType === 'river';
  const crossSection = river
    ? need('River cross-section', f.crossSection, pos, 'must be a positive number (m2).')
    : NaN;
  const volume = river
    ? NaN
    : need('Lake volume', f.volume, pos, 'must be a positive number (m3).');
  const upstream = need('Upstream flow', f.upstreamFlow, nonneg, 'must be zero or more (m3/d).');
  const background = need('Background', f.background, nonneg, 'must be zero or more (mg/L).');
  const mixing = need(
    'Mixing fraction',
    f.mixingFraction,
    (x) => x > 0 && x <= 1,
    'must be above 0 and at most 1.',
  );
  const decay = need('Decay rate', f.decay, nonneg, 'must be zero or more (1/d).');

  // the thickness is the Darcy discharge thickness, the screen of the bank average and the plane depth
  const needThickness = f.dischargeMode === 'darcy' || linked;
  const thickness = needThickness
    ? need('Discharge thickness', f.thickness, pos, 'must be a positive number (m).')
    : optional('Discharge thickness', f.thickness, pos, 'must be a positive number (m).');
  let discharge: SwRequest['discharge'] | undefined;
  if (f.dischargeMode === 'flow') {
    const flow = need('Groundwater discharge', f.flow, pos, 'must be a positive number (m3/d).');
    discharge = { kind: 'flow', flow: flow / DAY };
  } else {
    const k = need('Bed conductivity', f.bedConductivity, pos, 'must be a positive number (m/d).');
    const i = need('Bed gradient', f.gradient, pos, 'must be a positive number (-).');
    discharge = {
      kind: 'darcy',
      bedConductivity: k / DAY,
      thickness: thickness ?? NaN,
      gradient: i,
    };
  }

  let reach: SwRequest['reach'] | undefined;
  if (f.reachMode === 'domenico') {
    const w = need('Source width', f.sourceWidth, pos, 'must be a positive number (m).');
    reach = { kind: 'domenico', sourceWidth: w };
  } else {
    const L = need('Reach length', f.reachLength, pos, 'must be a positive number (m).');
    reach = { kind: 'entered', length: L };
  }
  const bankX = optional('Distance to the bank', f.bankX, pos, 'must be a positive number (m).');
  if (f.reachMode === 'domenico' && bankX === undefined && linked === false) {
    errors.push('Distance to the bank is needed for a reach length from the Domenico width (m).');
  }
  if (linked && bankX === undefined) {
    errors.push('Distance to the bank is needed to read the transport run at the bank (m).');
  }

  const c = need(
    'Groundwater concentration',
    f.groundwaterConcentration,
    nonneg,
    'must be zero or more (mg/L).',
  );
  const duration = need('Run length', f.durationYr, pos, 'must be a positive number (years).');

  let sediment: SwRequest['sediment'];
  if (f.sedimentOn) {
    const foc = need(
      'Fraction organic carbon',
      f.foc,
      (x) => x >= 0 && x <= 1,
      'must be between 0 and 1.',
    );
    const koc = optional('Koc', f.koc, pos, 'must be a positive number (L/kg).');
    const kd = optional('Kd', f.kd, pos, 'must be a positive number (L/kg).');
    sediment = {
      fractionOrganicCarbon: foc,
      ...(koc !== undefined ? { koc: koc / 1000 } : {}),
      ...(kd !== undefined ? { kd: kd / 1000 } : {}),
      poreWater: f.poreWater,
    };
  }
  const downstream = river
    ? optional('Downstream distance', f.downstream, pos, 'must be a positive number (m).')
    : undefined;
  const solubility = optional('Solubility', f.solubility, pos, 'must be a positive number (mg/L).');

  if (errors.length > 0 || discharge === undefined || reach === undefined) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    request: {
      body: river ? { type: 'river', crossSection } : { type: 'lake', volume },
      upstreamFlow: upstream / DAY,
      background: background * 1e-3,
      mixingFraction: mixing,
      decay: decay / DAY,
      reach,
      discharge,
      ...(thickness !== undefined ? { thickness } : {}),
      ...(bankX !== undefined ? { bankX } : {}),
      groundwaterConcentration: c * 1e-3,
      duration: duration * YEAR,
      ...(sediment ? { sediment } : {}),
      ...(downstream !== undefined ? { downstream } : {}),
      ...(solubility !== undefined ? { solubility: solubility * 1e-3 } : {}),
      link: linked ? link : null,
    },
  };
}
