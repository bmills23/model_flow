import type { RunInputRow } from '../project/runInputs';
import type { SwRequest } from './inputs';

const DAY = 86400;
const YEAR = 365.25 * DAY;
const sig = (x: number): number => Number(x.toPrecision(6));

const POREWATER_WORDS: Record<NonNullable<SwRequest['sediment']>['poreWater'], string> = {
  discharge: 'the groundwater discharge',
  centreline: 'the plume centreline',
  surface: 'the surface water',
};

/**
 * The inputs of a surface water run, as the surface water screen showed them when its concentration was
 * sent to the exposure and risk screen: the water body, the groundwater discharge and reach, the
 * groundwater source (or the transport run that fed it), the sediment and the downstream point. Built
 * from the request the run was made with, in the screen's units (m, m3/d, mg/L, 1/d, L/kg).
 */
export function surfaceWaterRunInputs(request: SwRequest): RunInputRow[] {
  const rows: RunInputRow[] = [];
  const add = (label: string, value: number | undefined, unit: string, scale = 1): void => {
    if (value !== undefined && Number.isFinite(value)) {
      rows.push({ label, value: `${sig(value * scale)}${unit === '' ? '' : ` ${unit}`}` });
    }
  };
  const text = (label: string, value: string): void => {
    rows.push({ label, value });
  };
  if (request.body.type === 'river') {
    text('Water body', 'River');
    add('River cross-section', request.body.crossSection, 'm2');
  } else {
    text('Water body', 'Lake');
    add('Lake volume', request.body.volume, 'm3');
  }
  add('Upstream flow', request.upstreamFlow, 'm3/d', DAY);
  add('Background concentration upstream', request.background, 'mg/L', 1e3);
  add('Mixing fraction', request.mixingFraction, '');
  add('Decay rate', request.decay, '1/d', DAY);
  if (request.discharge.kind === 'darcy') {
    add('Bed conductivity', request.discharge.bedConductivity, 'm/d', DAY);
    add('Bed gradient', request.discharge.gradient, '');
  } else {
    add('Groundwater discharge', request.discharge.flow, 'm3/d', DAY);
  }
  add('Discharge thickness', request.thickness, 'm');
  if (request.reach.kind === 'entered') add('Reach length', request.reach.length, 'm');
  else add('Source width (reach length from the Domenico width)', request.reach.sourceWidth, 'm');
  add('Distance from the source face to the bank', request.bankX, 'm');
  if (request.link !== null) {
    text(
      'Groundwater source',
      `fed by the transport run sent to this screen (${request.link.label})`,
    );
  } else {
    add('Groundwater concentration', request.groundwaterConcentration, 'mg/L', 1e3);
    add('Run length', request.duration, 'yr', 1 / YEAR);
  }
  if (request.sediment !== undefined) {
    add('Fraction organic carbon in sediment', request.sediment.fractionOrganicCarbon, '');
    add('Organic carbon partition coefficient', request.sediment.koc, 'L/kg', 1e3);
    add('Sediment partition coefficient', request.sediment.kd, 'L/kg', 1e3);
    text('Sediment pore water taken from', POREWATER_WORDS[request.sediment.poreWater]);
  } else {
    text('Sediment', 'not calculated');
  }
  add('Distance downstream of the reach', request.downstream, 'm');
  add('Solubility', request.solubility, 'mg/L', 1e3);
  return rows;
}
