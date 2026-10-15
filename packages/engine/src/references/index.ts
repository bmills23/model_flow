import { z } from 'zod';
import data from './references.json' with { type: 'json' };

export const referenceSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]*$/),
  type: z.enum(['method', 'data', 'review', 'software', 'guidance']),
  status: z.enum(['used', 'planned', 'fixture', 'data']),
  authors: z.string().min(1),
  year: z.number().int(),
  title: z.string().min(1),
  venue: z.string().optional(),
  identifier: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()),
});

export type Reference = z.infer<typeof referenceSchema>;

export const references: Reference[] = z.array(referenceSchema).parse(data);

const withPeriod = (s: string): string => (s.endsWith('.') ? s : `${s}.`);

/** "Authors (Year). Title. Venue. Identifier." with absent segments omitted. */
export function formatReference(ref: Reference): string {
  const parts = [`${ref.authors} (${ref.year}).`, withPeriod(ref.title)];
  if (ref.venue) parts.push(withPeriod(ref.venue));
  if (ref.identifier) parts.push(withPeriod(ref.identifier));
  return parts.join(' ');
}
