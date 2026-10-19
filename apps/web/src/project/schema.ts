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
import { text } from './fields';

export const PROJECT_FORMAT = 'model_flow.project';

/** Every screen key of format version 1. An absent key means that screen's defaults. */
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
 * A feed is stored as the values the user chose to send, with the screen it came from and a hash of
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
      })
      .refine(sameLength, sameLengthMessage),
  ).optional(),
  vadose: feedEnvelope(
    z.object({ scenario: jsonObject, method: z.enum(['legacy', 'modern']), label: text }),
  ).optional(),
  saturated: feedEnvelope(
    z.object({ input: jsonObject, method: z.enum(['legacy', 'modern']), label: text }),
  ).optional(),
  bank: feedEnvelope(z.object({ scenario: jsonObject, label: text })).optional(),
  vaporVadose: feedEnvelope(jsonObject).optional(),
  vaporWaterTable: feedEnvelope(jsonObject).optional(),
  vaporSaturated: feedEnvelope(jsonObject).optional(),
  vaporRisk: feedEnvelope(jsonObject).optional(),
  household: feedEnvelope(jsonObject).optional(),
  produce: feedEnvelope(jsonObject).optional(),
  tph: feedEnvelope(jsonObject).optional(),
};

/** Every feed key of format version 1. Each entry is validated on its own (see `parseProject`). */
export const feedsSchema = z.object(feedShapes);

/** The data editions the project was made against (directory names under packages/data/generated). */
export const dataSchema = z.object({
  rsl: text.optional(),
  nrwqc: text.optional(),
  sediment: text.optional(),
});

export const projectV1Schema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(1),
  createdWith: text,
  savedAt: z.iso.datetime({ offset: true }),
  title: text.optional(),
  screens: screensSchema,
  // each entry is checked on its own by parseProject, so one unusable feed never refuses the file
  feeds: z.record(z.string(), z.unknown()).optional(),
  data: dataSchema.optional(),
});
export type Feeds = z.infer<typeof feedsSchema>;
export type Project = Omit<z.infer<typeof projectV1Schema>, 'feeds'> & { feeds?: Feeds };
