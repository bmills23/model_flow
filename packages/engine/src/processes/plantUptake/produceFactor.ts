import { checkNonNegative, type PlantWarning } from './checks.js';
import { hhrapProduce, type HhrapProduceInput } from './hhrap.js';
import { legacyPlantUptake, type LegacyPlantInput } from './legacy.js';

/**
 * Fresh-weight plant factor for the M4 `produce` pathway: kg of fresh produce per kg of soil, per unit
 * soil concentration (kg/kg per kg/kg). The uptake engines are linear in the soil concentration when
 * no air or irrigation term is present, so the factor is the engine run at a unit soil concentration.
 * Vapor and irrigation contributions are not soil-proportional and stay out of the factor (they are
 * reported by the uptake engines directly).
 */
export type ProduceFactorRequest =
  | {
      method: 'legacy';
      input: Omit<
        LegacyPlantInput,
        'soil' | 'airConcentration_kg_per_m3' | 'rootZoneWater_kg_per_m3'
      > & {
        soil: Omit<LegacyPlantInput['soil'], 'concentration_kg_per_kg'>;
      };
    }
  | {
      method: 'hhrap';
      /** Moisture fraction of the fresh produce, [0, 1); converts HHRAP dry weight to fresh weight. User input. */
      moistureFraction: number;
      input: Omit<
        HhrapProduceInput,
        'soilConcentration_kg_per_kg' | 'vaporAirConcentration_kg_per_m3'
      >;
    };

export interface ProduceFactorResult {
  /** Null when the engine cannot quantify the plant concentration. */
  factor: number | null;
  warnings: PlantWarning[];
}

export function producePlantFactor(req: ProduceFactorRequest): ProduceFactorResult {
  if (req.method === 'legacy') {
    const r = legacyPlantUptake({
      ...req.input,
      soil: { ...req.input.soil, concentration_kg_per_kg: 1 },
    });
    return { factor: r.concentration_kg_per_kg, warnings: r.warnings };
  }
  checkNonNegative('moisture fraction', req.moistureFraction);
  if (req.moistureFraction >= 1) throw new RangeError('moisture fraction must be below 1');
  const r = hhrapProduce({ ...req.input, soilConcentration_kg_per_kg: 1 });
  return {
    factor:
      r.total_kg_per_kg_dw === null ? null : r.total_kg_per_kg_dw * (1 - req.moistureFraction),
    warnings: r.warnings,
  };
}
