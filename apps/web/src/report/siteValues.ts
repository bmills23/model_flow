import { applyTexture as saturatedTexture, type SaturatedForm } from '../saturated/form';
import { applyTexture as vadoseTexture, type LayerForm as VadoseLayer } from '../vadose/form';
import { applyTexture as vaporTexture, type LayerForm as VaporLayer } from '../vapor/form';
import type { ScreenKey } from './methodsRun';

/**
 * The site values of each screen: the inputs that describe the site, the receptor and the run rather than
 * a chemical's properties (those are compared with the database in `basis.ts`). None of them carries a
 * cited source in the program: a value the user typed has only the user's word, and a value the form was
 * pre-filled with is an example value, not the site's. The report lists every one that is in use as an
 * entry without a source, so it never claims that no value lacks a source.
 *
 * Exceptions, because the program does cite them: the soil properties a layer takes from a texture class
 * (EPA's class averages, `vapor/textures.ts`) while they are still the class's values.
 */

type Form = Record<string, unknown>;

/** What the label of an entry of a list (a soil layer, a loading step) is told. */
interface Item {
  index: number;
  item: Form;
}

export interface SiteField {
  /** Path in the screen form; `list[].field` for the entries of a list, `a.b` for a nested object. */
  key: string;
  label: string | ((i: Item) => string);
  unit?: string;
  /** False when the form's choices make the value unused. */
  when?: (form: Form) => boolean;
  /** True for an entry whose texture class fills it (see the module note). */
  fromTexture?: boolean;
}

const f = (
  key: string,
  label: SiteField['label'],
  unit?: string,
  extra: Partial<Pick<SiteField, 'when' | 'fromTexture'>> = {},
): SiteField => ({ key, label, ...(unit === undefined ? {} : { unit }), ...extra });

const on = (key: string) => (form: Form) => form[key] === true;
const is = (key: string, value: unknown) => (form: Form) => form[key] === value;
const all =
  (...tests: ((form: Form) => boolean)[]) =>
  (form: Form) =>
    tests.every((t) => t(form));

/** The seven soil properties of a vadose layer. */
const vadoseLayer = (list: string, name: (i: Item) => string): SiteField[] => [
  f(`${list}.thickness`, (i) => `${name(i)}, thickness`, 'm'),
  f(`${list}.thetaS`, (i) => `${name(i)}, porosity`, '', { fromTexture: true }),
  f(`${list}.thetaR`, (i) => `${name(i)}, residual water content`, '', { fromTexture: true }),
  f(`${list}.n`, (i) => `${name(i)}, van Genuchten n`, '', { fromTexture: true }),
  f(`${list}.Ks`, (i) => `${name(i)}, saturated conductivity`, 'm/d', { fromTexture: true }),
  f(`${list}.rhoB`, (i) => `${name(i)}, bulk density`, 'g/cm3', { fromTexture: true }),
  f(`${list}.foc`, (i) => `${name(i)}, organic carbon fraction`),
];

const above = (i: Item) => `Layer ${i.index + 1} above the source`;
const below = (i: Item) => `Layer ${i.index + 1} below the source`;

const vaporLayer = (): SiteField[] => {
  const name = (i: Item) => String(i.item['name'] ?? '') || `Stratum ${i.index + 1}`;
  return [
    f('layers[].thickness', (i) => `${name(i)}, thickness`, 'm'),
    f('layers[].porosity', (i) => `${name(i)}, porosity`, '', { fromTexture: true }),
    f('layers[].moisture', (i) => `${name(i)}, water-filled porosity`, '', { fromTexture: true }),
    f('layers[].bulkDensity', (i) => `${name(i)}, bulk density`, 'g/cm3', { fromTexture: true }),
    f('layers[].foc', (i) => `${name(i)}, organic carbon fraction`),
  ];
};

const receptor = (prefix: string, who: string): SiteField[] => [
  f(`${prefix}.soilSkinArea`, `${who}, soil skin area`, 'cm2'),
  f(`${prefix}.soilAdherence`, `${who}, soil adherence`, 'mg/cm2'),
  f(`${prefix}.waterIngestion`, `${who}, drinking water`, 'L/day'),
  f(`${prefix}.waterSkinArea`, `${who}, skin area for water`, 'cm2'),
  f(`${prefix}.inhalationRate`, `${who}, breathing rate`, 'm3/h'),
  f(`${prefix}.bathTime`, `${who}, bathing time`, 'h/day'),
  f(`${prefix}.swimTime`, `${who}, swimming time`, 'h/day'),
  f(`${prefix}.swimDays`, `${who}, swimming`, 'days/yr'),
  f(`${prefix}.outdoorTime`, `${who}, outdoor air time`, 'h/day'),
];

const conc = (): SiteField[] =>
  (
    [
      ['soil', 'soil', 'mg/kg'],
      ['groundwater', 'groundwater', 'mg/L'],
      ['bathroomAir', 'bathroom air', 'mg/m3'],
      ['indoorAir', 'indoor air', 'mg/m3'],
      ['outdoorAir', 'outdoor air', 'mg/m3'],
      ['surfaceWater', 'surface water', 'mg/L'],
    ] as const
  ).map(([k, label, unit]) =>
    f(
      `chemicals[].conc.${k}`,
      (i) => `${String(i.item['name'] ?? 'Chemical')}, ${label} concentration`,
      unit,
    ),
  );

/** The site values of each screen that has any. A screen absent here types no site value. */
export const SITE_FIELDS: Partial<Record<ScreenKey, SiteField[]>> = {
  transport: [
    f('K', 'Hydraulic conductivity', 'm/d', { when: is('aquiferMode', 'darcy') }),
    f('gradient', 'Hydraulic gradient', 'm/m', { when: is('aquiferMode', 'darcy') }),
    f('velocityYr', 'Seepage velocity', 'm/yr', { when: is('aquiferMode', 'velocity') }),
    f('porosity', 'Porosity'),
    f('thickness', 'Aquifer thickness', 'm', { when: is('thicknessMode', 'finite') }),
    f('width', 'Aquifer width', 'm'),
    f('retardation', 'Retardation factor', '', { when: is('retardMode', 'factor') }),
    f('foc', 'Organic carbon fraction', '', { when: is('retardMode', 'kd') }),
    f('bulkDensity', 'Bulk density', 'kg/L', { when: is('retardMode', 'kd') }),
    f('halfLifeYr', 'Decay half-life', 'yr'),
    f('srcLength', 'Source length along flow', 'm'),
    f('srcWidth', 'Source width across flow', 'm'),
    f('srcDepth', 'Source thickness', 'm'),
    f('c0', 'Source concentration', 'mg/L', {
      when: all(
        is('sourceMode', 'concentration'),
        (x) => !x['feedFromVadose'] && !x['feedFromSaturated'],
      ),
    }),
    f('massRate', 'Mass release rate', 'g/d', {
      when: all(
        is('sourceMode', 'massRate'),
        (x) => !x['feedFromVadose'] && !x['feedFromSaturated'],
      ),
    }),
    f('pulseYr', 'Pulse duration', 'yr', { when: is('loading', 'pulse') }),
    f('steps[].start', (i) => `Loading step ${i.index + 1} start`, 'yr', {
      when: is('loading', 'steps'),
    }),
    f('steps[].end', (i) => `Loading step ${i.index + 1} end`, 'yr', {
      when: is('loading', 'steps'),
    }),
    f('steps[].factor', (i) => `Loading step ${i.index + 1} factor`, '', {
      when: is('loading', 'steps'),
    }),
    f('alphaLOverride', 'Longitudinal dispersivity', 'm'),
    f('alphaTOverride', 'Transverse dispersivity', 'm'),
    f('alphaVOverride', 'Vertical dispersivity', 'm'),
    f('rx', 'Receptor distance downgradient', 'm'),
    f('ry', 'Receptor distance across flow', 'm'),
    f('rDepth', 'Receptor depth below the water table', 'm', { when: (x) => x['screen'] !== true }),
    f('screenTop', 'Well screen top', 'm depth', { when: on('screen') }),
    f('screenBottom', 'Well screen bottom', 'm depth', { when: on('screen') }),
    f('timeYr', 'Evaluation time', 'yr'),
  ],
  vadose: [
    f('infiltration', 'Infiltration', 'cm/yr'),
    f('mu', 'Decay in the leachate', '1/d'),
    ...vadoseLayer('source', () => 'Source layer'),
    f('srcLength', 'Source length', 'm'),
    f('srcWidth', 'Source width', 'm'),
    f('srcF', 'Chemical in the soil', 'mg/kg'),
    f('srcFT', 'TPH in the soil', 'mg/kg', { when: on('tphOn') }),
    f('srcMT', 'TPH molar mass', 'g/mol', { when: on('tphOn') }),
    f('srcDecay', 'Source decay rate', '1/d'),
    ...vadoseLayer('above[]', above),
    ...vadoseLayer('below[]', below),
    f('durationYr', 'Run length', 'yr'),
    f('alphaL', 'Longitudinal dispersivity', 'm', { when: is('dispersivityBasis', 'entered') }),
  ],
  saturated: [
    f('srcLength', 'Source length along flow', 'm'),
    f('srcWidth', 'Source width across flow', 'm'),
    f('srcThickness', 'Source thickness', 'm'),
    f('hMin', 'Minimum saturated thickness', 'm'),
    f('dh', 'Water-table fluctuation', 'm', { when: is('schedule', 'seasonal') }),
    f('fractionHigh', 'Fraction of the year at high water', '', {
      when: is('schedule', 'seasonal'),
    }),
    f('porosity', 'Porosity', '', { fromTexture: true }),
    f('rhoB', 'Bulk density', 'g/cm3', { fromTexture: true }),
    f('foc', 'Organic carbon fraction'),
    f('thetaR', 'Residual water content', '', { fromTexture: true }),
    f('n', 'van Genuchten n', '', { fromTexture: true }),
    f('K', 'Aquifer conductivity', 'm/d'),
    f('gradient', 'Hydraulic gradient', 'm/m'),
    f('infiltration', 'Infiltration', 'cm/yr'),
    f('F', 'Chemical in the soil', 'mg/kg'),
    f('FT', 'TPH in the soil', 'mg/kg', { when: on('tphOn') }),
    f('MT', 'TPH molar mass', 'g/mol', { when: on('tphOn') }),
    f('srcDecay', 'Source decay rate', '1/d'),
    f('horizonYr', 'Horizon', 'yr'),
  ],
  vapor: [
    f('temperature', 'Soil temperature', 'deg C'),
    f('soilConc', 'Chemical in the soil', 'mg/kg', { when: is('source', 'soil') }),
    f('tph', 'TPH in the soil', 'mg/kg', { when: all(is('source', 'soil'), on('tphOn')) }),
    f('tphMolarMass', 'TPH molar mass', 'g/mol', { when: all(is('source', 'soil'), on('tphOn')) }),
    f('soilGas', 'Soil gas concentration', 'mg/m3', { when: is('source', 'soilGas') }),
    f('cgw', 'Groundwater concentration', 'mg/L', { when: is('source', 'groundwater') }),
    ...vaporLayer(),
    f('floorDepth', 'Depth of the floor below grade', 'm'),
    f('capHeight', 'Capillary zone thickness', 'm'),
    f('capPorosity', 'Capillary zone porosity'),
    f('capMoisture', 'Capillary zone water-filled porosity'),
    f('floorArea', 'Floor area', 'm2'),
    f('volume', 'Enclosed volume', 'm3'),
    f('airExchange', 'Air exchange rate', '1/h'),
    f('crackFraction', 'Crack fraction'),
    f('foundationThickness', 'Foundation thickness', 'm'),
    f('foundationPorosity', 'Foundation porosity'),
    f('foundationMoisture', 'Foundation water-filled porosity'),
    f('dP', 'Indoor-outdoor pressure difference', 'Pa', { when: is('soilGasMode', 'pressure') }),
    f('kv', 'Soil vapor permeability', 'cm2', { when: is('soilGasMode', 'pressure') }),
    f('seam', 'Crack seam length', 'm', { when: is('soilGasMode', 'pressure') }),
    f('viscosity', 'Air viscosity, legacy method', 'g/(cm s)'),
    f('viscosityModern', 'Air viscosity, modern method', 'g/(cm s)'),
    f('qsoil', 'Soil gas flow', 'L/min', { when: is('soilGasMode', 'entered') }),
    f('dvKw', 'Aerobic first-order rate', '1/h', { when: is('method', 'devaull') }),
    f('dvAerobicDepth', 'Aerobic layer depth', 'm', {
      when: all(is('method', 'devaull'), is('dvOxMode', 'entered')),
    }),
    f('dvO2Percent', 'Oxygen at the base of the foundation', '% by volume', {
      when: is('method', 'devaull'),
    }),
    f('dvMassRatio', 'Oxygen mass ratio', 'g O2 per g chemical', { when: is('method', 'devaull') }),
    f('dvDa', 'Oxygen diffusion in air', 'cm2/s', { when: is('method', 'devaull') }),
    f('dvDw', 'Oxygen diffusion in water', 'cm2/s', { when: is('method', 'devaull') }),
    f('dvH', "Oxygen Henry's constant", '', { when: is('method', 'devaull') }),
    f('dvTotalHc', 'Total hydrocarbon vapor at the source', 'mg/m3', {
      when: is('method', 'devaull'),
    }),
  ],
  surfaceWater: [
    f('crossSection', 'River cross-section', 'm2', { when: is('bodyType', 'river') }),
    f('volume', 'Lake volume', 'm3', { when: is('bodyType', 'lake') }),
    f('upstreamFlow', 'Upstream flow', 'm3/d'),
    f('background', 'Upstream background', 'mg/L'),
    f('mixingFraction', 'Mixing fraction'),
    f('decay', 'Decay in the water', '1/d'),
    f('bedConductivity', 'Bed conductivity', 'm/d', { when: is('dischargeMode', 'darcy') }),
    f('gradient', 'Bed gradient', '', { when: is('dischargeMode', 'darcy') }),
    f('flow', 'Groundwater discharge', 'm3/d', { when: is('dischargeMode', 'flow') }),
    f('thickness', 'Discharge thickness', 'm'),
    f('reachLength', 'Reach length', 'm', { when: is('reachMode', 'entered') }),
    f('sourceWidth', 'Source width', 'm'),
    f('bankX', 'Distance from the source face to the bank', 'm'),
    f('groundwaterConcentration', 'Groundwater concentration', 'mg/L', {
      when: (x) => x['linked'] !== true,
    }),
    f('durationYr', 'Run length', 'yr'),
    f('foc', 'Fraction organic carbon', '', { when: on('sedimentOn') }),
    f('solubility', 'Solubility ceiling', 'mg/L'),
    f('downstream', 'River receptor downstream', 'm'),
  ],
  risk: [
    ...conc(),
    ...receptor('a', 'Receptor A'),
    ...receptor('b', 'Receptor B'),
    f('startYr', 'Exposure start', 'yr', { when: is('startMode', 'pinned') }),
  ],
  cleanup: [
    ...conc(),
    ...receptor('a', 'Receptor A'),
    ...receptor('b', 'Receptor B'),
    f('startConc', 'Starting concentration'),
    f('solubility', 'Solubility ceiling', 'mg/L'),
    f('wellTarget', 'Well concentration target', 'mg/L'),
    f('windowYr', 'Averaging time', 'yr'),
    f('targetRisk', 'Target cancer risk'),
    f('targetHq', 'Target hazard quotient'),
    f('ssg.daf', 'Dilution attenuation factor', '', { when: (x) => ssgOn(x) }),
    f('ssg.userTarget', 'Groundwater target', 'ug/L', { when: (x) => ssgOn(x) }),
    f('ssg.sourceDepth', 'Source depth', 'm', { when: (x) => ssgOn(x) }),
    f('ssg.rhoB', 'Bulk density', 'kg/L', { when: (x) => ssgOn(x) }),
    f('ssg.foc', 'Organic carbon fraction', '', { when: (x) => ssgOn(x) }),
    f('ssg.theta', 'Water-filled porosity', '', { when: (x) => ssgOn(x) }),
    f('ssg.siteK', 'Hydraulic conductivity', 'm/d', { when: (x) => ssgOn(x) }),
    f('ssg.siteGradient', 'Hydraulic gradient', 'm/m', { when: (x) => ssgOn(x) }),
    f('ssg.siteInfiltration', 'Infiltration', 'cm/yr', { when: (x) => ssgOn(x) }),
    f('ssg.siteL', 'Source length along flow', 'm', { when: (x) => ssgOn(x) }),
    f('ssg.siteDa', 'Aquifer thickness', 'm', { when: (x) => ssgOn(x) }),
  ],
  household: [
    f('waterConcentration', 'Tap and irrigation water concentration', 'mg/L', {
      when: (x) => x['showerWaterSource'] === 'entered' || x['irrigationWaterSource'] === 'entered',
    }),
    f('soilConcentration', 'Surface soil concentration', 'mg/kg'),
    f('showerDropletDiameter', 'Shower droplet diameter', 'mm'),
    f('showerFallTime', 'Shower droplet fall time', 's'),
    f('showerFlow', 'Shower water flow', 'L/min'),
    f('showerMinutes', 'Shower duration', 'min'),
    f('stallVolume', 'Stall volume', 'm3'),
    f('ventilation', 'Stall ventilation', 'm3/min'),
    f('postShowerMinutes', 'Time after the water is off', 'min'),
    f('householdFactor', 'Household transfer factor K', 'L water per m3 air'),
    f('filmGas', 'Gas film reference', 'cm/h'),
    f('filmLiquid', 'Liquid film reference', 'cm/h'),
    f('sprayDropletDiameter', 'Sprinkler droplet diameter', 'mm'),
    f('sprayFallTime', 'Sprinkler droplet fall time', 's'),
    f('sprinklerFlow', 'Sprinkler flow', 'L/min'),
    f('applicationRate', 'Application rate', 'mm/h'),
    f('windSpeed', 'Wind speed', 'm/s'),
    f('mixingHeight', 'Mixing height', 'm'),
    f('boxLength', 'Box length', 'm'),
    f('boxWidth', 'Box width', 'm'),
    f('qOverC', 'Q/C', 'g/(m2 s) per kg/m3'),
    f('pm10Flux', 'PM10 flux'),
  ],
  plantsEco: [
    f('soilConcentration', 'Soil concentration', 'mg/kg dry weight'),
    f('userBcf', 'Bioconcentration factor', 'kg/kg', { when: on('inorganic') }),
    f('bulkDensity', 'Dry bulk density', 'kg/L'),
    f('waterFilledPorosity', 'Water-filled porosity'),
    f('foc', 'Organic carbon fraction'),
    f('moistureFraction', 'Moisture fraction of the fresh produce'),
    f('tscf', 'Transpiration stream concentration factor'),
    f('transpiration', 'Transpiration rate', 'L/d'),
    f('conductance', 'Leaf conductance', 'm/d'),
    f('leafArea', 'Leaf area', 'm2'),
    f('plantMass', 'Plant mass', 'kg'),
    f('kLeafAir', 'Leaf-air partition coefficient', 'm3/kg'),
    f('lossRate', 'Loss rate, growth dilution and metabolism', '1/d'),
    f('growthPeriod', 'Growing period', 'd'),
    f('custom.abovegroundExposed.gPerKgDay', 'Exposed aboveground produce, intake', 'g/kg-day', {
      when: is('intakeMode', 'custom'),
    }),
    f('custom.abovegroundExposed.loss', 'Exposed aboveground produce, preparation loss', '', {
      when: is('intakeMode', 'custom'),
    }),
    f(
      'custom.abovegroundExposed.homegrown',
      'Exposed aboveground produce, fraction homegrown',
      '',
      {
        when: is('intakeMode', 'custom'),
      },
    ),
    f(
      'custom.abovegroundProtected.gPerKgDay',
      'Protected aboveground produce, intake',
      'g/kg-day',
      {
        when: is('intakeMode', 'custom'),
      },
    ),
    f('custom.abovegroundProtected.loss', 'Protected aboveground produce, preparation loss', '', {
      when: is('intakeMode', 'custom'),
    }),
    f(
      'custom.abovegroundProtected.homegrown',
      'Protected aboveground produce, fraction homegrown',
      '',
      { when: is('intakeMode', 'custom') },
    ),
    f('custom.root.gPerKgDay', 'Root produce, intake', 'g/kg-day', {
      when: is('intakeMode', 'custom'),
    }),
    f('custom.root.loss', 'Root produce, preparation loss', '', {
      when: is('intakeMode', 'custom'),
    }),
    f('custom.root.homegrown', 'Root produce, fraction homegrown', '', {
      when: is('intakeMode', 'custom'),
    }),
    f('tphTotal', 'Total TPH in soil', 'mg/kg'),
    f('tphTargetHi', 'Target hazard index'),
    f('tphThetaA', 'Air-filled porosity'),
  ],
};

function ssgOn(form: Form): boolean {
  return (form['ssg'] as Form | undefined)?.['on'] === true;
}

/** Form paths that hold a choice, a name, a display option or a chemical property: not a site value. */
export const NOT_SITE_VALUES: Partial<Record<ScreenKey, readonly string[]>> = {
  transport: [
    'aquiferMode',
    'thicknessMode',
    'retardMode',
    'kd',
    'chemicalId',
    'sourceMode',
    'loading',
    'dispLaw',
    'xMin',
    'xMax',
    'yHalf',
    'mapMethod',
    'scale',
  ],
  vadose: [
    'chemicalId',
    'M',
    'S',
    'H',
    'Koc',
    'Da',
    'Dw',
    'source.texture',
    'above[].texture',
    'below[].texture',
    'dispersivityBasis',
    'hydraulicModel',
    'method',
    'scale',
    'measure',
  ],
  saturated: [
    'chemicalId',
    'M',
    'S',
    'H',
    'Koc',
    'schedule',
    'texture',
    'hydraulicModel',
    'method',
  ],
  vapor: [
    'chemicalId',
    'M',
    'S',
    'H',
    'Koc',
    'Da',
    'Dw',
    'TB',
    'TC',
    'dHvb',
    'source',
    'layers[].name',
    'layers[].texture',
    'foundation',
    'soilGasMode',
    'method',
    'dvOxMode',
  ],
  surfaceWater: [
    'bodyType',
    'dischargeMode',
    'reachMode',
    'chemicalId',
    'koc',
    'kd',
    'poreWater',
    'scale',
  ],
  risk: ['a.preset', 'b', 'startMode'],
  cleanup: ['ssg.targetKind', 'source', 'targetKind', 'a.preset', 'b', 'allocation', 'ssg.on'],
  household: [
    'chemicalId',
    'chemicalName',
    'henry',
    'molecularWeight',
    'henryAtm',
    'vaporPressure',
    'volatileOverride',
    'showerMethod',
    'particulateMethod',
    'showerWaterSource',
    'irrigationWaterSource',
    // the particulate defaults are the printed values of the soil screening guidance
    'vegetativeCover',
    'meanWind',
    'thresholdWind',
    'fx',
  ],
  plantsEco: [
    'chemicalId',
    'chemicalName',
    'logKow',
    'koc',
    'kd',
    'uptake',
    'intakeMode',
    'ageGroup',
    'tphSet',
  ],
};

/** One site value in use: what it is called, the value with its unit, and whether the user changed it. */
export interface SiteEntry {
  subject: string;
  value: string;
  /** True when the value differs from the one the form was pre-filled with. */
  typed: boolean;
}

interface Hit {
  value: unknown;
  /** The object the field sits in (the form, a nested object, or a list entry). */
  parent: Form;
  item: Item | null;
  /** The matching value of the default form, when it has one at the same place. */
  base: unknown;
}

const isObject = (v: unknown): v is Form =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The places a key reaches in a form: one for a plain path, one per entry for a path through `list[]`. */
function reach(form: Form, base: Form, key: string): Hit[] {
  const segs = key.split('.');
  let hits: { cur: unknown; parent: Form; item: Item | null; base: unknown }[] = [
    { cur: form, parent: form, item: null, base },
  ];
  for (const seg of segs) {
    const next: typeof hits = [];
    for (const h of hits) {
      if (seg.endsWith('[]')) {
        const name = seg.slice(0, -2);
        const list = isObject(h.cur) ? h.cur[name] : undefined;
        const baseList = isObject(h.base) ? h.base[name] : undefined;
        if (!Array.isArray(list)) continue;
        list.forEach((entry, index) => {
          if (!isObject(entry)) return;
          const b = Array.isArray(baseList) ? baseList[index] : undefined;
          next.push({ cur: entry, parent: entry, item: { index, item: entry }, base: b });
        });
      } else if (isObject(h.cur)) {
        const parent = h.cur;
        next.push({
          cur: parent[seg],
          parent,
          item: h.item,
          base: isObject(h.base) ? h.base[seg] : undefined,
        });
      }
    }
    hits = next;
  }
  return hits.map((h) => ({ value: h.cur, parent: h.parent, item: h.item, base: h.base }));
}

/** The value a texture class fills into the field, or undefined when the field is not filled by one. */
function presetValue(screen: ScreenKey, parent: Form, field: string): string | undefined {
  const texture = parent['texture'];
  if (typeof texture !== 'string' || texture === 'custom') return undefined;
  const filled =
    screen === 'vadose'
      ? vadoseTexture(parent as unknown as VadoseLayer, texture as never)
      : screen === 'vapor'
        ? vaporTexture(parent as unknown as VaporLayer, texture as never)
        : screen === 'saturated'
          ? saturatedTexture(parent as unknown as SaturatedForm, texture as never)
          : null;
  const v = (filled as Form | null)?.[field];
  return typeof v === 'string' ? v : undefined;
}

const sameNumber = (a: string, b: string): boolean => {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : a === b;
};

/**
 * The site values a screen's form holds that the run uses: every non-blank one, except a soil property that
 * still has the value of the texture class it was filled from (that is cited). `defaults` is the form a
 * new project starts with; a value equal to it was pre-filled, any other was typed.
 */
export function siteEntries(screen: ScreenKey, form: Form, defaults: Form): SiteEntry[] {
  const out: SiteEntry[] = [];
  for (const field of SITE_FIELDS[screen] ?? []) {
    if (field.when !== undefined && !field.when(form)) continue;
    const name = field.key.split('.').pop()!.replace('[]', '');
    for (const hit of reach(form, defaults, field.key)) {
      if (typeof hit.value !== 'string' || hit.value.trim() === '') continue;
      const text = hit.value.trim();
      if (field.fromTexture === true) {
        const preset = presetValue(screen, hit.parent, name);
        if (preset !== undefined && sameNumber(preset, text)) continue;
      }
      const subject =
        typeof field.label === 'function'
          ? field.label(hit.item ?? { index: 0, item: hit.parent })
          : field.label;
      const unit = field.unit ?? '';
      out.push({
        subject,
        value: unit === '' ? text : `${text} ${unit}`,
        typed: typeof hit.base !== 'string' || !sameNumber(hit.base.trim(), text),
      });
    }
  }
  return out;
}
