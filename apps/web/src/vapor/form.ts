import {
  celsiusToKelvin,
  convertGcmsToPa,
  dimensionlessToAtmHenry,
  SOIL_TEXTURES,
  stratumFromTexture,
  T_REF,
  type EpaJeInput,
  type FoundationType,
  type LegacyJeInput,
  type SoilLayer,
  type SoilTextureCode,
  type Stratum,
} from '@model-flow/engine';

export type TextureChoice = SoilTextureCode | 'custom';
export type SourceKind = 'soil' | 'soilGas' | 'groundwater';
export type SoilGasMode = 'pressure' | 'entered';

/** One stratum in the units the person types, listed from the ground surface down. */
export interface LayerForm {
  name: string;
  texture: TextureChoice;
  thickness: string; // m
  porosity: string;
  moisture: string;
  bulkDensity: string; // g/cm3
  foc: string;
}

export interface VaporForm {
  chemicalId: string; // CAS-style id from the database, or 'risc4-benzene'
  M: string; // g/mol
  S: string; // mg/L
  H: string; // dimensionless, 25 deg C
  Koc: string; // mL/g
  Da: string; // cm2/s
  Dw: string; // cm2/s
  TB: string; // K, optional
  TC: string; // K, optional
  dHvb: string; // cal/mol, optional
  temperature: string; // deg C, modern method
  source: SourceKind;
  soilConc: string; // mg/kg
  tphOn: boolean;
  tph: string; // mg/kg
  tphMolarMass: string; // g/mol
  soilGas: string; // mg/m3
  cgw: string; // mg/L
  layers: LayerForm[];
  floorDepth: string; // m below grade
  capHeight: string; // m, blank = texture of the deepest stratum (modern), none (legacy)
  capPorosity: string;
  capMoisture: string;
  // building
  foundation: FoundationType;
  floorArea: string; // m2
  volume: string; // m3
  airExchange: string; // 1/h
  crackFraction: string;
  foundationThickness: string; // m
  foundationPorosity: string; // legacy foundation layer
  foundationMoisture: string;
  soilGasMode: SoilGasMode;
  dP: string; // Pa
  kv: string; // cm2
  seam: string; // m
  viscosity: string; // g/(cm s)
  qsoil: string; // L/min
  method: 'legacy' | 'modern';
}

export const RISC4_BENZENE_ID = 'risc4-benzene';

/** Benzene values of the RISC4 chemical database, the test inputs of Table R-3 (not a database). */
export const RISC4_BENZENE = {
  M: '78',
  S: '1750',
  H: '0.228',
  Koc: '59',
  Da: '0.088',
  Dw: '9.8e-6',
} as const;

const R3_SOIL = { porosity: '0.35', bulkDensity: '1.7', foc: '0.01' } as const;

export const DEFAULT_FORM: VaporForm = {
  chemicalId: RISC4_BENZENE_ID,
  ...RISC4_BENZENE,
  TB: '',
  TC: '',
  dHvb: '',
  temperature: '25',
  source: 'soil',
  soilConc: '1000',
  tphOn: false,
  tph: '1000',
  tphMolarMass: '100',
  soilGas: '1000',
  cgw: '1',
  layers: [
    {
      name: 'Soil above the floor',
      texture: 'custom',
      thickness: '2',
      ...R3_SOIL,
      moisture: '0.05',
    },
    { name: 'Vadose zone', texture: 'custom', thickness: '2.6', ...R3_SOIL, moisture: '0.05' },
    {
      name: 'Lens at the source',
      texture: 'custom',
      thickness: '0.2',
      ...R3_SOIL,
      moisture: '0.15',
    },
  ],
  floorDepth: '2',
  capHeight: '',
  capPorosity: '',
  capMoisture: '',
  foundation: 'basementSlab',
  floorArea: '150',
  volume: '400',
  airExchange: '0.5',
  crackFraction: '0.001',
  foundationThickness: '0.15',
  foundationPorosity: '0.25',
  foundationMoisture: '0',
  soilGasMode: 'pressure',
  dP: '1',
  kv: '1e-9',
  seam: '50',
  viscosity: '1.8e-4',
  qsoil: '5',
  method: 'legacy',
};

export const FOUNDATIONS: { value: FoundationType; label: string }[] = [
  { value: 'slabOnGrade', label: 'Slab on grade' },
  { value: 'basementSlab', label: 'Basement with a slab' },
  { value: 'basementDirt', label: 'Basement with a dirt floor' },
  { value: 'crawlSlab', label: 'Crawl space with a slab' },
  { value: 'crawlDirt', label: 'Crawl space with a dirt floor' },
];

export const TEXTURE_OPTIONS: { value: TextureChoice; label: string }[] = [
  { value: 'custom', label: 'Custom values' },
  ...Object.values(SOIL_TEXTURES).map((t) => ({ value: t.code, label: t.name })),
];

/** Fills the porosity, moisture and bulk density of a layer from a texture preset. */
export function applyTexture(layer: LayerForm, texture: TextureChoice): LayerForm {
  if (texture === 'custom') return { ...layer, texture };
  const t = SOIL_TEXTURES[texture];
  return {
    ...layer,
    texture,
    porosity: String(t.porosity),
    moisture: String(t.moisture),
    bulkDensity: String(t.bulkDensity / 1000),
  };
}

export function newLayer(index: number): LayerForm {
  return {
    name: `Stratum ${index + 1}`,
    texture: 'custom',
    thickness: '1',
    porosity: '0.35',
    moisture: '0.15',
    bulkDensity: '1.7',
    foc: '0.01',
  };
}

export type Parsed =
  { ok: true; legacy: LegacyJeInput; modern: EpaJeInput } | { ok: false; errors: string[] };

class Reader {
  errors: string[] = [];
  num(
    raw: string,
    label: string,
    rule: 'pos' | 'nonneg' | 'any' | 'frac' | 'fracpos' = 'pos',
  ): number {
    const t = raw.trim();
    const v = t === '' ? NaN : Number(t);
    if (!Number.isFinite(v)) {
      this.errors.push(`${label} must be a number`);
      return NaN;
    }
    if (rule === 'pos' && !(v > 0)) this.errors.push(`${label} must be greater than 0`);
    if (rule === 'nonneg' && v < 0) this.errors.push(`${label} must not be negative`);
    if (rule === 'frac' && !(v >= 0 && v <= 1)) this.errors.push(`${label} must be from 0 to 1`);
    if (rule === 'fracpos' && !(v > 0 && v <= 1))
      this.errors.push(`${label} must be above 0, at most 1`);
    return v;
  }
  optional(raw: string, label: string): number | undefined {
    return raw.trim() === '' ? undefined : this.num(raw, label);
  }
}

/** Parses the form into the legacy and modern engine inputs, or lists every field that fails. */
export function toInputs(f: VaporForm): Parsed {
  const r = new Reader();
  const M = r.num(f.M, 'Molar mass');
  const S = r.num(f.S, 'Solubility');
  const Hp = r.num(f.H, "Henry's constant");
  const Da = r.num(f.Da, 'Diffusion in air');
  const Dw = r.num(f.Dw, 'Diffusion in water', 'nonneg');
  const temperature = r.num(f.temperature, 'Soil temperature', 'any');
  const tb = r.optional(f.TB, 'Boiling point');
  const tc = r.optional(f.TC, 'Critical temperature');
  const dh = r.optional(f.dHvb, 'Enthalpy of vaporization');
  const thermo =
    tb !== undefined && tc !== undefined && dh !== undefined
      ? { TB: tb, TC: tc, dHvb: dh }
      : undefined;
  if (thermo === undefined && (tb !== undefined || tc !== undefined || dh !== undefined)) {
    r.errors.push('Boiling point, critical temperature and enthalpy of vaporization go together');
  }

  const strata: Stratum[] = [];
  f.layers.forEach((l, i) => {
    const tag = `${l.name || `Stratum ${i + 1}`}`;
    const thickness = r.num(l.thickness, `${tag} thickness`);
    const porosity = r.num(l.porosity, `${tag} porosity`, 'fracpos');
    const moisture = r.num(l.moisture, `${tag} moisture`, 'frac');
    const rho = r.num(l.bulkDensity, `${tag} bulk density`);
    const foc = r.num(l.foc, `${tag} organic carbon`, 'frac');
    if (Number.isFinite(porosity) && Number.isFinite(moisture) && moisture > porosity) {
      r.errors.push(`${tag} moisture must not exceed its porosity`);
    }
    strata.push(
      l.texture === 'custom'
        ? { thickness, porosity, moisture, bulkDensity: rho * 1000, foc }
        : stratumFromTexture(l.texture, thickness, foc, {
            porosity,
            moisture,
            bulkDensity: rho * 1000,
          }),
    );
  });
  if (strata.length === 0) r.errors.push('Add at least one soil stratum');
  const floorDepth = r.num(f.floorDepth, 'Depth of the floor below grade');

  // Building
  const area = r.num(f.floorArea, 'Floor area');
  const volume = r.num(f.volume, 'Enclosed volume');
  const ach = r.num(f.airExchange, 'Air exchange rate');
  const crack = r.num(f.crackFraction, 'Crack fraction', 'fracpos');
  const fThick = r.num(f.foundationThickness, 'Foundation thickness', 'nonneg');
  const fPor = r.num(f.foundationPorosity, 'Foundation porosity', 'fracpos');
  const fMoist = r.num(f.foundationMoisture, 'Foundation moisture', 'frac');
  let legacyFlow;
  let modernFlow;
  if (f.soilGasMode === 'entered') {
    const q = (r.num(f.qsoil, 'Soil gas flow into the building', 'nonneg') * 1e-3) / 60;
    legacyFlow = { Qsoil: q };
    modernFlow = { Qsoil: q };
  } else {
    const dP = r.num(f.dP, 'Pressure difference', 'nonneg');
    const kv = r.num(f.kv, 'Soil vapor permeability') * 1e-4;
    const seam = r.num(f.seam, 'Crack seam length');
    const mu = convertGcmsToPa(r.num(f.viscosity, 'Air viscosity'));
    legacyFlow = { dP, kv, mu, Xcrack: seam, Zcrack: floorDepth };
    modernFlow = { dP, kv, mu, Xcrack: seam };
  }

  // Source
  let concentration = NaN;
  if (f.source === 'soil') concentration = r.num(f.soilConc, 'Chemical in the soil', 'nonneg');
  if (f.source === 'soilGas') concentration = r.num(f.soilGas, 'Soil gas concentration', 'nonneg');
  if (f.source === 'groundwater') {
    concentration = r.num(f.cgw, 'Groundwater concentration', 'nonneg');
  }
  const tph = f.source === 'soil' && f.tphOn ? r.num(f.tph, 'TPH in the soil') : NaN;
  const mt = f.source === 'soil' && f.tphOn ? r.num(f.tphMolarMass, 'TPH molar mass') : NaN;
  const KocRaw = f.source === 'soil' ? r.num(f.Koc, 'Koc', 'nonneg') : 0;

  const capH = r.optional(f.capHeight, 'Capillary zone thickness');
  const capP = r.optional(f.capPorosity, 'Capillary zone porosity');
  const capM = r.optional(f.capMoisture, 'Capillary zone moisture');

  if (r.errors.length > 0) return { ok: false, errors: r.errors };

  // Strata run from grade down; the legacy column is what lies below the floor, source first.
  const deepest = strata[strata.length - 1]!;
  let top = 0;
  const below: SoilLayer[] = [];
  for (const s of strata) {
    const hi = top + s.thickness;
    // A stratum wholly below the floor keeps its entered thickness exactly.
    const thickness = top >= floorDepth ? s.thickness : hi - floorDepth;
    if (hi > floorDepth) {
      below.unshift({ thickness, porosity: s.porosity, moisture: s.moisture });
    }
    top = hi;
  }
  const H = Hp;
  const chem = { Da: Da * 1e-4, Dw: Dw * 1e-4, H };
  const kdLegacy = KocRaw * 1e-3 * deepest.foc;
  const MkG = M * 1e-3;
  const SkgM3 = S * 1e-3;
  const legacySource: LegacyJeInput['source'] =
    f.source === 'soil'
      ? {
          kind: 'soil',
          F: concentration * 1e-6,
          rhoB: deepest.bulkDensity,
          kd: kdLegacy,
          theta: deepest.moisture,
          thetaA: deepest.porosity - deepest.moisture,
          H,
          M: MkG,
          S: SkgM3,
          ...(f.tphOn ? { FT: tph * 1e-6, MT: mt * 1e-3 } : {}),
        }
      : f.source === 'soilGas'
        ? { kind: 'soilGas', csg: concentration * 1e-6 }
        : { kind: 'groundwater', cgw: concentration * 1e-3, H, S: SkgM3 };

  const legacy: LegacyJeInput = {
    chemical: chem,
    layers: below,
    ...(f.source === 'groundwater' && capH !== undefined && capP !== undefined && capM !== undefined
      ? { capillaryFringe: { thickness: capH, porosity: capP, moisture: capM } }
      : {}),
    building: {
      volume,
      airExchangeRate: ach / 3600,
      floorArea: area,
      crackFraction: crack,
      foundation: { thickness: fThick, porosity: fPor, moisture: fMoist },
      soilGas: legacyFlow,
    },
    source: legacySource,
  };

  const side = Math.sqrt(area);
  const modernSource: EpaJeInput['source'] =
    f.source === 'soil'
      ? {
          kind: 'soil',
          F: concentration * 1e-6,
          ...(f.tphOn ? { FT: tph * 1e-6, MT: mt * 1e-3 } : {}),
        }
      : f.source === 'soilGas'
        ? { kind: 'soilGas', csg: concentration * 1e-6 }
        : { kind: 'groundwater', cgw: concentration * 1e-3 };
  const capillary = {
    ...(capH !== undefined ? { height: capH } : {}),
    ...(capP !== undefined ? { porosity: capP } : {}),
    ...(capM !== undefined ? { moisture: capM } : {}),
  };
  const modern: EpaJeInput = {
    chemical: {
      Da: chem.Da,
      Dw: chem.Dw,
      henryAtm: dimensionlessToAtmHenry(Hp, T_REF),
      koc: KocRaw * 1e-3,
      M: MkG,
      S: SkgM3,
      ...(thermo ? { thermo } : {}),
    },
    temperature: celsiusToKelvin(temperature),
    strata,
    floorDepth,
    building: {
      foundation: f.foundation,
      floorLength: side,
      floorWidth: side,
      depthBelowGrade: floorDepth,
      mixingHeight: volume / area,
      airExchangeRate: ach / 3600,
      foundationThickness: fThick,
      crackFraction: crack,
      soilGas: modernFlow,
    },
    source: modernSource,
    ...(f.source === 'groundwater' && Object.keys(capillary).length > 0 ? { capillary } : {}),
  };
  return { ok: true, legacy, modern };
}

/** True while the inputs are the Table R-3 case A (the method shown does not matter). */
export function isR3Case(f: VaporForm): boolean {
  return JSON.stringify({ ...f, method: 'legacy' }) === JSON.stringify(DEFAULT_FORM);
}

export const R3_PUBLISHED = {
  riscMgPerM3: 8.57,
  tolerance: 0.005,
  citations: ['arcadis2001', 'spence2001'] as const,
};
