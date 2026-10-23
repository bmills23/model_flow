import { z } from 'zod';
import { cleanupProjectSchema } from '../cleanup/project';
import { householdProjectSchema } from '../household/project';
import { plantsEcoProjectSchema } from '../plantsEco/project';
import { riskProjectSchema } from '../risk/project';
import { saturatedProjectSchema } from '../saturated/project';
import { surfaceWaterProjectSchema } from '../surfaceWater/project';
import { transportProjectSchema } from '../transport/project';
import { uncertaintyProjectSchema } from '../uncertainty/project';
import { vadoseProjectSchema } from '../vadose/project';
import { vaporProjectSchema } from '../vapor/project';
import { overridesSchema } from '../overrides/project';
import { siteSchema } from '../site/project';
import { chemicalsSchema } from './chemicals';
import { text } from './fields';

export const PROJECT_FORMAT = 'model_flow.project';

/** Every screen key of the project file. An absent key means that screen's defaults. */
export const screensSchema = z.object({
  transport: transportProjectSchema.optional(),
  vadose: vadoseProjectSchema.optional(),
  saturated: saturatedProjectSchema.optional(),
  vapor: vaporProjectSchema.optional(),
  surfaceWater: surfaceWaterProjectSchema.optional(),
  risk: riskProjectSchema.optional(),
  cleanup: cleanupProjectSchema.optional(),
  household: householdProjectSchema.optional(),
  plantsEco: plantsEcoProjectSchema.optional(),
  uncertainty: uncertaintyProjectSchema.optional(),
});

const sameLength = (v: { times: unknown[]; values: unknown[] }): boolean =>
  v.times.length === v.values.length;
const sameLengthMessage = { message: 'times and values must have the same length' };
const numbers = z.array(z.number().finite());

/**
 * A feed slot is stored as the values the user chose to send, with the screen it came from and a hash of
 * that screen's form at the time (see `feedEntry`). A series feed (well, surface water) is checked
 * in full; feeds that carry a whole scenario (vadose, saturated, bank, vapor) are checked for their
 * top-level keys, with the scenario itself a JSON object (non-finite numbers are tagged, see
 * `codec.ts`). The vapor screen's four received feeds are four entries (vaporVadose, vaporWaterTable,
 * vaporSaturated, vaporRisk), each fingerprinted against its own source form. The transport chain
 * feed holds a closure and is not stored.
 */
const feedEnvelope = <V extends z.ZodType>(value: V) =>
  z.object({ source: text, inputsHash: text, value });

const jsonObject = z.record(z.string(), z.json());

export const feedShapes = {
  well: feedEnvelope(
    z
      .object({
        method: z.enum(['legacy', 'modern', 'domenico']),
        label: text,
        times: numbers,
        values: numbers,
        chemicalId: text.optional(),
      })
      .refine(sameLength, sameLengthMessage),
  ).optional(),
  surfaceWater: feedEnvelope(
    z
      .object({
        method: z.enum(['well-mixed', 'mass-discharge']),
        origin: text,
        label: text,
        times: numbers,
        values: numbers,
        coefficient: z
          .object({
            value: z.number().nullable(),
            reason: text.nullable(),
            method: text,
            sourceMedium: z.literal('groundwater'),
            sourceUnit: z.literal('mg/L'),
            source: z.number().optional(),
            solubility: z.number().optional(),
            path: z.enum(['linear', 'background', 'fed', 'none']).optional(),
          })
          .optional(),
        solve: z.object({ request: jsonObject }).optional(),
        chemicalId: text.optional(),
      })
      .refine(sameLength, sameLengthMessage),
  ).optional(),
  vadose: feedEnvelope(
    z.object({
      scenario: jsonObject,
      method: z.enum(['legacy', 'modern']),
      label: text,
      chemicalId: text.optional(),
    }),
  ).optional(),
  saturated: feedEnvelope(
    z.object({
      input: jsonObject,
      method: z.enum(['legacy', 'modern']),
      label: text,
      chemicalId: text.optional(),
    }),
  ).optional(),
  bank: feedEnvelope(
    z.object({ scenario: jsonObject, label: text, chemicalId: text.optional() }),
  ).optional(),
  vaporVadose: feedEnvelope(jsonObject).optional(),
  vaporWaterTable: feedEnvelope(jsonObject).optional(),
  vaporSaturated: feedEnvelope(jsonObject).optional(),
  vaporRisk: feedEnvelope(jsonObject).optional(),
  household: feedEnvelope(jsonObject).optional(),
  produce: feedEnvelope(jsonObject).optional(),
  tph: feedEnvelope(jsonObject).optional(),
};

type SlotShapes = typeof feedShapes;

/**
 * The feeds about one chemical (every feed that carries a `chemicalId`): from format version 2 each is
 * stored as an object of slots by chemical id (the empty key for a value sent while its screen's
 * chemical was typed by hand), each slot an envelope as above. The TPH feed is about a composition and
 * stays a single envelope.
 */
export const CHEMICAL_FEEDS = [
  'well',
  'surfaceWater',
  'vadose',
  'saturated',
  'bank',
  'vaporVadose',
  'vaporWaterTable',
  'vaporSaturated',
  'vaporRisk',
  'household',
  'produce',
] as const satisfies readonly (keyof SlotShapes)[];
export type ChemicalFeedKey = (typeof CHEMICAL_FEEDS)[number];
export const isChemicalFeed = (key: string): key is ChemicalFeedKey =>
  (CHEMICAL_FEEDS as readonly string[]).includes(key);

const slotRecord = <S extends z.ZodType>(slot: S) => z.record(z.string(), slot);

/** Every feed key of format version 2. Each slot is validated on its own (see `parseProject`). */
export const feedsSchema = z.object({
  well: slotRecord(feedShapes.well.unwrap()).optional(),
  surfaceWater: slotRecord(feedShapes.surfaceWater.unwrap()).optional(),
  vadose: slotRecord(feedShapes.vadose.unwrap()).optional(),
  saturated: slotRecord(feedShapes.saturated.unwrap()).optional(),
  bank: slotRecord(feedShapes.bank.unwrap()).optional(),
  vaporVadose: slotRecord(feedShapes.vaporVadose.unwrap()).optional(),
  vaporWaterTable: slotRecord(feedShapes.vaporWaterTable.unwrap()).optional(),
  vaporSaturated: slotRecord(feedShapes.vaporSaturated.unwrap()).optional(),
  vaporRisk: slotRecord(feedShapes.vaporRisk.unwrap()).optional(),
  household: slotRecord(feedShapes.household.unwrap()).optional(),
  produce: slotRecord(feedShapes.produce.unwrap()).optional(),
  tph: feedShapes.tph,
});

/** The data editions the project was made against (directory names under packages/data/generated). */
export const dataSchema = z.object({
  rsl: text.optional(),
  nrwqc: text.optional(),
  sediment: text.optional(),
  /** The international criteria sets (directory name under packages/data/generated); absent in older files. */
  criteria: text.optional(),
});

export const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(2),
  createdWith: text,
  savedAt: z.iso.datetime({ offset: true }),
  title: text.optional(),
  screens: screensSchema,
  // project-level values that replace database values for this project only (see overrides/)
  overrides: overridesSchema.optional(),
  // the advisory site model choices (see site/); absent means the defaults
  site: siteSchema.optional(),
  // the project chemical list (see chemicals.ts); absent means derive it from the screens on open
  chemicals: chemicalsSchema.optional(),
  // each entry is checked on its own by parseProject, so one unusable feed never refuses the file
  feeds: z.record(z.string(), z.unknown()).optional(),
  data: dataSchema.optional(),
});
export type Feeds = z.infer<typeof feedsSchema>;
export type Project = Omit<z.infer<typeof projectSchema>, 'feeds'> & { feeds?: Feeds };
