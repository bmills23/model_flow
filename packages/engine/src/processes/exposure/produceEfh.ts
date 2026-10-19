import type { ProduceBoundary, ProduceClass } from './produce.js';

/**
 * Homegrown produce intake preset from the Exposure Factors Handbook 2011 edition, chapter 13
 * (`epa2011efh`, EPA/600/R-09/052F). Read on 2026-10-18 from
 * https://www.epa.gov/sites/default/files/2015-09/documents/efh-chapter13.pdf (SHA-256
 * 2d393f4459cb6fba518aa64ee8ccd92dc4bd6557f2ebf10706200df6dfc3decc) through `pdftotext -layout`.
 *
 * Values are the consumer-only mean intake of home-produced food, g per kg body weight per day, by age
 * group, unadjusted for preparation loss: Table 13-58 exposed fruit, 13-59 protected fruits, 13-60
 * exposed vegetables, 13-61 protected vegetables, 13-62 root vegetables. A null is an age group the
 * handbook withholds because fewer than 20 observations were available. The mean preparation and
 * cooking loss is Table 13-69, "Mean Net Preparation/Cooking Loss": fruits 25.4 percent, vegetables
 * 12.4 percent (the separate post-cooking loss column is not applied).
 *
 * Mapping to the model's classes: exposed fruit and exposed vegetables add into above-ground exposed;
 * protected fruits and protected vegetables into above-ground protected; root vegetables are root.
 * Consumer-only means describe people who ate that food group, so adding two groups assumes the same
 * person is a consumer of both: the preset suits a household that grows and eats all of them and
 * overstates a population mean.
 */
export const EFH_AGE_GROUPS = [
  '1 to 2',
  '3 to 5',
  '6 to 11',
  '12 to 19',
  '20 to 39',
  '40 to 69',
  '70 and over',
] as const;
export type EfhAgeGroup = (typeof EFH_AGE_GROUPS)[number];

type Row = Record<EfhAgeGroup, number | null>;

const EXPOSED_FRUIT: Row = {
  '1 to 2': null,
  '3 to 5': 2.6,
  '6 to 11': 2.52,
  '12 to 19': 1.33,
  '20 to 39': 1.09,
  '40 to 69': 1.25,
  '70 and over': 1.39,
};
const PROTECTED_FRUIT: Row = {
  '1 to 2': null,
  '3 to 5': null,
  '6 to 11': null,
  '12 to 19': 2.96,
  '20 to 39': 4.51,
  '40 to 69': 5.65,
  '70 and over': 4.44,
};
const EXPOSED_VEG: Row = {
  '1 to 2': 3.48,
  '3 to 5': 1.74,
  '6 to 11': 1.39,
  '12 to 19': 1.07,
  '20 to 39': 1.05,
  '40 to 69': 1.6,
  '70 and over': 1.68,
};
const PROTECTED_VEG: Row = {
  '1 to 2': 2.46,
  '3 to 5': 1.3,
  '6 to 11': 1.1,
  '12 to 19': 0.78,
  '20 to 39': 0.76,
  '40 to 69': 0.93,
  '70 and over': 1.05,
};
const ROOT_VEG: Row = {
  '1 to 2': 2.52,
  '3 to 5': 1.28,
  '6 to 11': 1.32,
  '12 to 19': 0.94,
  '20 to 39': 0.87,
  '40 to 69': 1.13,
  '70 and over': 1.22,
};

/** Table 13-69, mean net preparation/cooking loss. */
export const EFH_PREPARATION_LOSS = { fruit: 0.254, vegetable: 0.124 } as const;

export interface EfhProducePreset {
  ageGroup: EfhAgeGroup;
  /** Boundary intake per class; the loss is already applied and the homegrown fraction is 1. */
  intakes: ProduceBoundary;
  /** Classes left out because a contributing food group has no published mean for this age group. */
  omitted: ProduceClass[];
}

function net(value: number | null, loss: number): number | null {
  return value === null ? null : value * (1 - loss);
}

function add(...parts: (number | null)[]): number | null {
  let sum = 0;
  for (const p of parts) {
    if (p === null) return null;
    sum += p;
  }
  return sum;
}

/**
 * Home-produced intake of an age group, net of the preparation loss, as boundary intakes (g/kg-day).
 * The intakes are home-produced already, so the homegrown fraction is 1 and the loss is not applied a
 * second time.
 */
export function efhHomeProducedIntake(ageGroup: EfhAgeGroup): EfhProducePreset {
  const L = EFH_PREPARATION_LOSS;
  const classes: [ProduceClass, number | null][] = [
    [
      'abovegroundExposed',
      add(net(EXPOSED_FRUIT[ageGroup], L.fruit), net(EXPOSED_VEG[ageGroup], L.vegetable)),
    ],
    [
      'abovegroundProtected',
      add(net(PROTECTED_FRUIT[ageGroup], L.fruit), net(PROTECTED_VEG[ageGroup], L.vegetable)),
    ],
    ['root', net(ROOT_VEG[ageGroup], L.vegetable)],
  ];
  const intakes: ProduceBoundary = {};
  const omitted: ProduceClass[] = [];
  for (const [k, v] of classes) {
    if (v === null) omitted.push(k);
    else intakes[k] = { gPerKgDay: v, fractionHomegrown: 1 };
  }
  return { ageGroup, intakes, omitted };
}
