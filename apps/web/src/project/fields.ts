import { z } from 'zod';

/** A form field kept as the typed text. */
export const text = z.string();
export const flag = z.boolean();

/** An object whose every field is optional: an absent field takes the screen's default on load. */
export const partialObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial();

/** Text fields from a list of keys. */
export function texts<K extends string>(...keys: K[]): Record<K, z.ZodString> {
  return Object.fromEntries(keys.map((k) => [k, text])) as Record<K, z.ZodString>;
}
