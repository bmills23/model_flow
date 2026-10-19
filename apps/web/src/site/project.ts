import { z } from 'zod';
import {
  DIRECT_MEDIA,
  MODELED_SOURCES,
  defaultSite,
  isDefaultSite,
  type SiteState,
  type SourceMedium,
} from './model';

const medium = z.enum([...DIRECT_MEDIA, ...MODELED_SOURCES] as [SourceMedium, ...SourceMedium[]]);

/**
 * The project-level `site` key of format version 1 (optional; absent means the defaults). The site
 * choices are advisory and hold no results.
 */
export const siteSchema = z.object({
  receptors: z.enum(['human', 'ecological']),
  basis: z.enum(['direct', 'modeled']),
  media: z.array(medium),
  location: z.enum(['onsite', 'downgradient']),
  vaporMethod: z.enum(['legacy', 'modern']),
  produceSoil: z.boolean(),
  produceIrrigation: z.boolean(),
});
export type SiteProject = z.infer<typeof siteSchema>;

/** The saved form, or undefined at the defaults so a file without site choices is unchanged. */
export function toProject(s: SiteState): SiteProject | undefined {
  return isDefaultSite(s) ? undefined : { ...s, media: [...s.media] };
}

export function fromProject(p: SiteProject | undefined): SiteState {
  return p === undefined ? defaultSite() : { ...p, media: [...p.media] };
}
