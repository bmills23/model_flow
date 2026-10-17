import { PATHWAY_IDS, type Medium, type PathwayId } from '@model-flow/engine';
import type { DermalForm } from '@model-flow/data/rsl-types';
import type { ChemicalRecord } from './chemicalDb';

/** The six media a concentration is entered for, with the unit shown (the RSL's units). */
export const MEDIA: readonly { key: Medium; label: string; unit: 'mg/kg' | 'mg/L' | 'mg/m3' }[] = [
  { key: 'soil', label: 'Soil', unit: 'mg/kg' },
  { key: 'groundwater', label: 'Groundwater', unit: 'mg/L' },
  { key: 'bathroomAir', label: 'Bathroom air', unit: 'mg/m3' },
  { key: 'indoorAir', label: 'Indoor air', unit: 'mg/m3' },
  { key: 'outdoorAir', label: 'Outdoor air', unit: 'mg/m3' },
  { key: 'surfaceWater', label: 'Surface water', unit: 'mg/L' },
];

export type PresetId = 'resident' | 'worker' | 'child';

export const PRESET_LABELS: Record<PresetId, string> = {
  resident: 'Resident',
  worker: 'Worker',
  child: 'Child resident',
};

export interface ReceptorForm {
  preset: PresetId;
  pathways: Record<PathwayId, boolean>;
  /** Site-specific entries; blank keeps the preset's value or, where it has none, leaves the pathway unquantified. */
  soilSkinArea: string;
  soilAdherence: string;
  waterIngestion: string;
  waterSkinArea: string;
  inhalationRate: string;
  bathTime: string;
  swimTime: string;
  swimDays: string;
  outdoorTime: string;
}

export interface ChemicalRow {
  id: string;
  name: string;
  /**
   * Dermal water by the organic lag-time model or by permeability times event time (inorganic). Starts as
   * the RSL's classification of the analyte; undefined when the RSL gives none, which leaves dermal
   * water unquantified until the user states it. It is never guessed.
   */
  dermalForm: DermalForm | undefined;
  /** Concentration per medium, in the screen unit; blank or absent means none entered. */
  conc: Partial<Record<Medium, string>>;
  /** Use the transport screen's well result as the groundwater concentration. */
  groundwaterFromWell: boolean;
}

export interface RiskForm {
  chemicals: ChemicalRow[];
  a: ReceptorForm;
  b: ReceptorForm | null;
  /** Also add the two receptors' cancer risks. */
  additive: boolean;
  routeExtrapolation: boolean;
  startMode: 'max-risk' | 'pinned';
  startYr: string;
}

export function defaultReceptor(preset: PresetId = 'resident'): ReceptorForm {
  return {
    preset,
    pathways: Object.fromEntries(PATHWAY_IDS.map((p) => [p, true])) as Record<PathwayId, boolean>,
    soilSkinArea: '',
    soilAdherence: '',
    waterIngestion: '',
    waterSkinArea: '',
    inhalationRate: '',
    bathTime: '',
    swimTime: '',
    swimDays: '',
    outdoorTime: '',
  };
}

export function defaultForm(): RiskForm {
  return {
    chemicals: [],
    a: defaultReceptor('resident'),
    b: null,
    additive: false,
    routeExtrapolation: false,
    startMode: 'max-risk',
    startYr: '0',
  };
}

export function newChemicalRow(rec: ChemicalRecord): ChemicalRow {
  return {
    id: rec.id,
    name: rec.name,
    dermalForm: rec.phys?.dermalForm,
    conc: {},
    groundwaterFromWell: false,
  };
}
