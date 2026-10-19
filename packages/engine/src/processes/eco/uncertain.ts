import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import { ECO_GROUPS, type BenchmarkScreenInput, type EcosslScreenInput } from './screen.js';

/**
 * Uncertain-input declarations of the ecological screening methods (uncertainty note, ruling 2). Ids are
 * `eco.<name>`. An Eco-SSL with status NA (null value), a wildlife receptor, a food item or an uptake
 * coefficient the base does not carry reads NaN and `set` refuses on an absent parent. Receptor names,
 * citations, the uptake form and the status flags are labels, not parameters.
 */

const FRACTION = [0, 1] as const;
const ANY = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] as const;

/** Benchmark slots, wildlife receptor slots and food item slots declared per receptor. */
export const ECO_DECLARED_BENCHMARKS = 4;
export const ECO_DECLARED_WILDLIFE = 2;
export const ECO_DECLARED_ITEMS = 4;

/** Declarations of `eco.ecossl-2005`. */
export function ecosslUncertainInputs(): UncertainInput<EcosslScreenInput>[] {
  type I = EcosslScreenInput;
  const rows: Row<I>[] = [
    ['soil', ['soil_kg_per_kg'], 'Soil concentration', 'kg/kg', 'site'],
    ...ECO_GROUPS.map((g): Row<I> => [
      `ssl.${g}`,
      ['ssl', g, 'value'],
      `Eco-SSL, ${g} group`,
      'kg/kg',
      'chemical',
    ]),
  ];
  return declareRows<I>('eco', rows);
}

/** Declarations of `eco.benchmark-hq`. */
export function benchmarkUncertainInputs(): UncertainInput<BenchmarkScreenInput>[] {
  type I = BenchmarkScreenInput;
  const rows: Row<I>[] = [['soil', ['soil_kg_per_kg'], 'Soil concentration', 'kg/kg', 'site']];
  for (let k = 0; k < ECO_DECLARED_BENCHMARKS; k++) {
    rows.push([
      `benchmark${k}`,
      ['benchmarks', k, 'value_kg_per_kg'],
      `Benchmark ${k + 1}`,
      'kg/kg',
      'chemical',
    ]);
  }
  for (let w = 0; w < ECO_DECLARED_WILDLIFE; w++) {
    const at = (...p: (string | number)[]) => ['wildlife', w, 'food', ...p];
    const tag = `Wildlife receptor ${w + 1}`;
    rows.push(
      [
        `wildlife${w}.ingestion`,
        at('foodIngestion_kg_per_kg_d'),
        `${tag} food ingestion rate`,
        'kg/(kg d)',
        'site',
      ],
      [
        `wildlife${w}.soilFraction`,
        at('soilFraction'),
        `${tag} soil fraction of the diet`,
        '1',
        'site',
        FRACTION,
      ],
      [
        `wildlife${w}.areaUseFactor`,
        at('areaUseFactor'),
        `${tag} area use factor`,
        '1',
        'site',
        FRACTION,
      ],
      [
        `wildlife${w}.trv`,
        at('trv_kg_per_kg_d'),
        `${tag} toxicity reference value`,
        'kg/(kg d)',
        'chemical',
      ],
    );
    for (let i = 0; i < ECO_DECLARED_ITEMS; i++) {
      const item = (...p: (string | number)[]) => at('items', i, ...p);
      const lab = `${tag} food item ${i + 1}`;
      rows.push(
        [
          `wildlife${w}.item${i}.dietFraction`,
          item('dietFraction'),
          `${lab} diet fraction`,
          '1',
          'site',
          FRACTION,
        ],
        [
          `wildlife${w}.item${i}.a`,
          item('model', 'a'),
          `${lab} uptake coefficient a`,
          '1',
          'chemical',
        ],
        [
          `wildlife${w}.item${i}.b`,
          item('model', 'b'),
          `${lab} uptake intercept b`,
          '1',
          'chemical',
          ANY,
        ],
        [
          `wildlife${w}.item${i}.cdiet`,
          item('model', 'cdiet'),
          `${lab} diet concentration factor`,
          '1',
          'chemical',
        ],
      );
    }
  }
  return declareRows<I>('eco', rows);
}
