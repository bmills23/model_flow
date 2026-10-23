import { legacyDispersivityBasis } from '../vadose/form';
import { DEFAULT_FORM as VAPOR_DEFAULT, oxygenClassDefaults } from '../vapor/form';

/** JSON text with object keys in sorted order, so equal content always gives equal text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v ?? null)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const body = Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A short fingerprint of a source form (FNV-1a, 32 bit, over the stable text) as eight hex digits.
 * It detects "the inputs changed since this feed was built"; it is not a security hash.
 */
export function hashInputs(value: unknown): string {
  const text = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Form keys added after the first file format, per source screen. A fingerprint is taken over the form
 * without them, so a key added later cannot change the fingerprint of a file written before it existed
 * (the loader fills a missing key with its default, which would otherwise read as an input change).
 *
 * `always`: the key only records where other fields were filled from (a chemical or soil texture
 * picker); the filled values are fields of their own and are fingerprinted. `atDefault`: the key does
 * feed the computation, so it counts as soon as it differs from its default and is left out only while
 * it equals it. Add every new form key to one of these lists, or a saved project opens with stale feeds.
 */
export const FINGERPRINT_SKIP: Record<
  string,
  {
    always?: readonly string[];
    atDefault?: Readonly<Record<string, unknown>>;
    /**
     * `legacy`: the key records a choice that an older file did not have and the loader reads off
     * other fields. It is left out while it equals that reading, so an older file keeps its
     * fingerprint, and counts as soon as it differs.
     */
    legacy?: Readonly<Record<string, (form: Record<string, unknown>) => unknown>>;
  }
> = {
  transport: { always: ['chemicalId'], atDefault: { foc: '0.001' } },
  vadose: {
    always: ['chemicalId', 'texture'],
    legacy: {
      dispersivityBasis: (form) =>
        legacyDispersivityBasis({
          alphaL: typeof form['alphaL'] === 'string' ? form['alphaL'] : '',
        }),
    },
  },
  saturated: { always: ['chemicalId', 'texture'] },
  plantsEco: { always: ['wildlifeRows'] },
  surfaceWater: { always: ['chemicalId'] },
  // the oxygen-limited method's keys (wave V slice V1) feed the computation, so each counts once it
  // differs from its default and a file written before they existed keeps its fingerprint
  vapor: {
    atDefault: {
      dvOxMode: VAPOR_DEFAULT.dvOxMode,
      dvAerobicDepth: VAPOR_DEFAULT.dvAerobicDepth,
      dvO2Percent: VAPOR_DEFAULT.dvO2Percent,
      dvDa: VAPOR_DEFAULT.dvDa,
      dvDw: VAPOR_DEFAULT.dvDw,
      dvH: VAPOR_DEFAULT.dvH,
      dvRespiration: VAPOR_DEFAULT.dvRespiration,
      dvTotalHc: VAPOR_DEFAULT.dvTotalHc,
    },
    // the class rate and mass ratio belong to the chemical: an older file's chemical gets the reading
    // `fromProject` gives it (the fixture's benzene values, or blank), which is no change
    legacy: {
      dvKw: (form) => oxygenClassDefaults(String(form['chemicalId'] ?? '')).dvKw,
      dvMassRatio: (form) => oxygenClassDefaults(String(form['chemicalId'] ?? '')).dvMassRatio,
    },
  },
};

function without(value: unknown, always: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => without(v, always));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (!always.includes(k)) out[k] = without(v, always);
  return out;
}

/** The part of a source form that a feed's fingerprint covers (see `FINGERPRINT_SKIP`). */
export function fingerprintForm(source: string, form: unknown): unknown {
  const rule = FINGERPRINT_SKIP[source];
  if (rule === undefined) return form;
  const out = without(form, rule.always ?? []) as Record<string, unknown>;
  for (const [k, d] of Object.entries(rule.atDefault ?? {})) if (out[k] === d) delete out[k];
  for (const [k, read] of Object.entries(rule.legacy ?? {}))
    if (out[k] === read(out)) delete out[k];
  return out;
}
