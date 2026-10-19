import { DIRECT_PATHWAY_IDS, type Medium, type PathwayId } from '@model-flow/engine';
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
  /**
   * Eat homegrown produce, from the plants and ecology screen's intake. Not one of the nine direct pathways:
   * it runs only for a chemical that also opts in (`ChemicalRow.produceFromPlantsEco`).
   */
  produce: boolean;
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
  /** Use the vapor screen's indoor and outdoor air for this chemical. */
  indoorFromVapor: boolean;
  outdoorFromVapor: boolean;
  /** Use the surface water screen's result as the swimming (surface water) concentration series. */
  surfaceWaterFromModel: boolean;
  /** Use the household screen's shower air for the bathroom air concentration. */
  bathroomFromHousehold: boolean;
  /** Use the household screen's whole-house (RSL) air as the indoor air concentration. */
  indoorFromHousehold: boolean;
  /** Use the household screen's sprinkler spray air or windblown particulate air as outdoor air. */
  outdoorFromHousehold: HouseholdOutdoor;
  /** Use the plants and ecology screen's plant factors for the homegrown produce pathway (soil concentration). */
  produceFromPlantsEco: boolean;
}

export type HouseholdOutdoor = '' | 'sprinkler' | 'particulate';

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
    pathways: Object.fromEntries(DIRECT_PATHWAY_IDS.map((p) => [p, true])) as Record<
      PathwayId,
      boolean
    >,
    soilSkinArea: '',
    soilAdherence: '',
    waterIngestion: '',
    waterSkinArea: '',
    inhalationRate: '',
    bathTime: '',
    swimTime: '',
    swimDays: '',
    outdoorTime: '',
    produce: false,
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
    indoorFromVapor: false,
    outdoorFromVapor: false,
    surfaceWaterFromModel: false,
    bathroomFromHousehold: false,
    indoorFromHousehold: false,
    outdoorFromHousehold: '',
    produceFromPlantsEco: false,
  };
}
