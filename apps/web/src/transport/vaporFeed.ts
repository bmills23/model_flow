import { groundwaterWaterTableSeries } from '@model-flow/engine';
import type { SourceSeries } from '../vapor/series';
import { receptorConcentration, withFedSteps, type MethodKey } from './compute';
import type { Scenario } from './form';

const POINTS = 32;

/**
 * The groundwater concentration at the water table under the receptor point (the building is taken to
 * stand there), at depth zero below the water table and not averaged over the well screen, from t = 0
 * to the evaluation time. Built with the engine's water-table adapter.
 */
export function waterTableSource(s: Scenario, method: MethodKey, label: string): SourceSeries {
  const resolved = withFedSteps(s);
  const times = [0, ...Array.from({ length: POINTS }, (_, i) => (s.time * (i + 1)) / POINTS)];
  const series = groundwaterWaterTableSeries(
    (t, p) => {
      const at: Scenario = {
        ...resolved,
        receptor: { x: p.x, y: p.y },
        receptorDepths: { top: 0, bottom: 0 },
      };
      return { concentrations: [t <= 0 ? 0 : receptorConcentration(at, method, t, 1)] };
    },
    { x: s.receptor.x, y: s.receptor.y },
    times,
    s.zOf(0),
  );
  return { kind: 'groundwater', label, series };
}
