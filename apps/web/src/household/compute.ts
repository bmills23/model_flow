import {
  irrigationEpcs,
  irrigationSprinklerFc,
  particulateBoxEmissionMethod,
  particulatePef1996,
  particulatePef2002,
  showerFc1986,
  showerLittle1992,
  showerRslHousehold,
  type FilmReferences,
  type Warning,
  type WindErosionInput,
} from '@model-flow/engine';
import { isBlank, makeReader, type HouseholdForm } from './form';

type Fail = { ok: false; errors: string[] };
export type Section<T> = ({ ok: true } & T) | Fail;

export interface ShowerRow {
  /** Exposure-average stall or house air, kg/m^3. */
  concentration: number;
  /** Air per unit water concentration, dimensionless. */
  coefficient: number;
  warnings: Warning[];
}
export interface LittleRow extends ShowerRow {
  endConcentration: number;
}

export interface IrrigationRow {
  /** Incidental ingestion and dermal EPC (the water concentration), kg/m^3. */
  ingestion: number;
  dermal: number;
  /** Spray inhalation air, kg/m^3. */
  sprayAir: number;
  sprayCoefficient: number;
  warnings: Warning[];
}

export interface ParticulateRow {
  /** Outdoor air, kg/m^3, and its coefficient per unit soil concentration. */
  concentration: number;
  coefficient: number;
  flux: number;
  /** PEF, m^3/kg, for the two PEF methods. */
  pef?: number;
  warnings: Warning[];
}

export interface HouseholdOutcome {
  shower: {
    legacy: Section<ShowerRow>;
    little: Section<LittleRow>;
    rsl: Section<ShowerRow>;
  };
  irrigation: Section<IrrigationRow>;
  particulate: {
    box: Section<ParticulateRow>;
    pef1996: Section<ParticulateRow>;
    pef2002: Section<ParticulateRow>;
  };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const MIN = 60;

function guarded<T>(errors: string[], run: () => T): Section<T> {
  if (errors.length > 0) return { ok: false, errors };
  try {
    return { ok: true, ...run() } as Section<T>;
  } catch (e) {
    return { ok: false, errors: [message(e)] };
  }
}

function showerSections(form: HouseholdForm): HouseholdOutcome['shower'] {
  const films = (errors: string[]): FilmReferences | undefined | null => {
    const gas = isBlank(form, 'filmGas');
    const liq = isBlank(form, 'filmLiquid');
    if (gas && liq) return undefined;
    if (gas !== liq) {
      errors.push('Enter both film reference coefficients, or neither to use the RISC5 choice');
      return null;
    }
    const read = makeReader(form, errors);
    return {
      gasCmPerH: read('filmGas', 'Gas film reference'),
      liquidCmPerH: read('filmLiquid', 'Liquid film reference'),
    };
  };

  const shared = (errors: string[]) => {
    const read = makeReader(form, errors);
    const filmReferences = films(errors);
    return {
      waterConcentration: read('waterConcentration', 'Tap water concentration') / 1000,
      henry: read('henry', 'Henry constant'),
      molecularWeight: read('molecularWeight', 'Molecular weight'),
      dropletDiameter: read('showerDropletDiameter', 'Shower droplet diameter') / 1000,
      fallTime: read('showerFallTime', 'Shower droplet fall time', { min: 'nonneg' }),
      waterFlow: read('showerFlow', 'Shower water flow') / 60000,
      showerTime: read('showerMinutes', 'Shower duration') * MIN,
      stallVolume: read('stallVolume', 'Stall volume'),
      ...(filmReferences ? { filmReferences } : {}),
    };
  };

  const legacy = (): Section<ShowerRow> => {
    const errors: string[] = [];
    const base = shared(errors);
    return guarded(errors, () => showerFc1986.run(base));
  };
  const little = (): Section<LittleRow> => {
    const errors: string[] = [];
    const base = shared(errors);
    const read = makeReader(form, errors);
    const gasFlow = read('ventilation', 'Stall ventilation', { min: 'nonneg' }) / MIN;
    const post = isBlank(form, 'postShowerMinutes')
      ? 0
      : read('postShowerMinutes', 'Time after the water is off', { min: 'nonneg' }) * MIN;
    return guarded(errors, () => {
      const r = showerLittle1992.run({ ...base, gasFlow, postShowerTime: post });
      return r;
    });
  };
  const rsl = (): Section<ShowerRow> => {
    const errors: string[] = [];
    const read = makeReader(form, errors);
    const waterConcentration = read('waterConcentration', 'Tap water concentration') / 1000;
    const transferFactorLPerM3 = read('householdFactor', 'Household transfer factor K', {
      min: 'nonneg',
    });
    return guarded(errors, () =>
      showerRslHousehold.run({ waterConcentration, transferFactorLPerM3, volatile: form.volatile }),
    );
  };
  return { legacy: legacy(), little: little(), rsl: rsl() };
}

function irrigationSection(form: HouseholdForm): Section<IrrigationRow> {
  const errors: string[] = [];
  const read = makeReader(form, errors);
  const cw = read('waterConcentration', 'Irrigation water concentration') / 1000;
  const filmErrors: string[] = [];
  let filmReferences: FilmReferences | undefined;
  const gas = isBlank(form, 'filmGas');
  const liq = isBlank(form, 'filmLiquid');
  if (!(gas && liq)) {
    if (gas !== liq)
      filmErrors.push('Enter both film reference coefficients, or neither to use the RISC5 choice');
    else {
      const r = makeReader(form, filmErrors);
      filmReferences = {
        gasCmPerH: r('filmGas', 'Gas film reference'),
        liquidCmPerH: r('filmLiquid', 'Liquid film reference'),
      };
    }
  }
  errors.push(...filmErrors);
  const sprinkler = {
    henry: read('henry', 'Henry constant'),
    molecularWeight: read('molecularWeight', 'Molecular weight'),
    dropletDiameter: read('sprayDropletDiameter', 'Sprinkler droplet diameter') / 1000,
    fallTime: read('sprayFallTime', 'Sprinkler droplet fall time', { min: 'nonneg' }),
    sprinklerFlow: read('sprinklerFlow', 'Sprinkler flow') / 60000,
    ...(filmReferences ? { filmReferences } : {}),
  };
  const box = {
    height: read('mixingHeight', 'Mixing height'),
    windSpeed: read('windSpeed', 'Wind speed'),
    ...(isBlank(form, 'boxLength') ? {} : { length: read('boxLength', 'Box length') }),
    ...(isBlank(form, 'boxWidth') ? {} : { width: read('boxWidth', 'Box width') }),
  };
  const rate = isBlank(form, 'applicationRate')
    ? undefined
    : read('applicationRate', 'Application rate') / 1000 / 3600;
  return guarded(errors, () => {
    const spray = irrigationSprinklerFc.run({ waterConcentration: cw, sprinkler, box });
    if (rate !== undefined) {
      const e = irrigationEpcs(cw, {
        sprinkler,
        box,
        applicationRate: rate,
        chemical: form.chemicalName.trim() || 'chemical',
        alsoPotable: form.alsoPotable,
      });
      return {
        ingestion: e.ingestion,
        dermal: e.dermal,
        sprayAir: e.sprayAir,
        sprayCoefficient: spray.coefficient,
        warnings: e.warnings,
      };
    }
    const warnings = [...spray.warnings];
    if (form.alsoPotable) {
      warnings.push({
        code: 'irrigation.potable-source',
        message:
          'The irrigation source is also the potable supply; the indoor drinking and bathing pathways will dominate the exposure.',
      });
    }
    return {
      ingestion: cw,
      dermal: cw,
      sprayAir: spray.concentration,
      sprayCoefficient: spray.coefficient,
      warnings,
    };
  });
}

function particulateSections(form: HouseholdForm): HouseholdOutcome['particulate'] {
  const common = (errors: string[]) => {
    const read = makeReader(form, errors);
    const soilConcentration =
      read('soilConcentration', 'Soil concentration', { min: 'nonneg' }) / 1e6;
    const vegetativeCover = read('vegetativeCover', 'Vegetative cover fraction', { min: 'nonneg' });
    if (vegetativeCover >= 1) errors.push('Vegetative cover fraction must be below 1');
    const wind: WindErosionInput = {
      vegetativeCover,
      meanWind: read('meanWind', 'Mean annual wind speed'),
      thresholdWind: read('thresholdWind', 'Threshold wind speed'),
      fx: read('fx', 'F(x)'),
    };
    const qOverC = isBlank(form, 'qOverC') ? undefined : read('qOverC', 'Q/C');
    return { soilConcentration, wind, qOverC };
  };
  const volatile = form.volatile;
  const pefRow = (run: typeof particulatePef1996): Section<ParticulateRow> => {
    const errors: string[] = [];
    const c = common(errors);
    return guarded(errors, () => {
      const r = run({
        soilConcentration: c.soilConcentration,
        wind: c.wind,
        volatile,
        ...(c.qOverC === undefined ? {} : { qOverC: c.qOverC }),
      });
      return {
        concentration: r.concentration,
        coefficient: r.coefficient,
        flux: r.qOverC / 1000 / r.pef,
        pef: r.pef,
        warnings: r.warnings,
      };
    });
  };
  const box = (): Section<ParticulateRow> => {
    const errors: string[] = [];
    const c = common(errors);
    const read = makeReader(form, errors);
    const boxIn = {
      length: read('boxLength', 'Box length'),
      width: read('boxWidth', 'Box width'),
      height: read('mixingHeight', 'Mixing height'),
      windSpeed: read('windSpeed', 'Wind speed'),
    };
    const flux = isBlank(form, 'pm10Flux') ? undefined : read('pm10Flux', 'PM10 flux') / 1000;
    return guarded(errors, () => {
      const r = particulateBoxEmissionMethod.run({
        soilConcentration: c.soilConcentration,
        wind: c.wind,
        box: boxIn,
        volatile,
        ...(flux === undefined ? {} : { flux }),
      });
      return {
        concentration: r.concentration,
        coefficient: r.coefficient,
        flux: r.flux,
        warnings: r.warnings,
      };
    });
  };
  return { box: box(), pef1996: pefRow(particulatePef1996), pef2002: pefRow(particulatePef2002) };
}

export function computeHousehold(form: HouseholdForm): HouseholdOutcome {
  return {
    shower: showerSections(form),
    irrigation: irrigationSection(form),
    particulate: particulateSections(form),
  };
}
