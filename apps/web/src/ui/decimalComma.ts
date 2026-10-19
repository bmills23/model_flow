/**
 * Per-viewer decimal comma entry. Form state, saved projects, share links and CSV always hold the
 * point form; only the text a viewer types and reads changes. Entry that cannot be read one way is
 * rejected with a message rather than guessed.
 */
const KEY = 'model_flow.decimalComma.v1';
const listeners = new Set<() => void>();
let on: boolean | null = null;

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function getDecimalComma(): boolean {
  if (on === null) on = load();
  return on;
}

export function setDecimalComma(value: boolean): void {
  on = value;
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // blocked storage: the choice holds for this visit only
  }
  for (const l of listeners) l();
}

export function subscribeDecimalComma(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export type Entry = { ok: true; canonical: string } | { ok: false; message: string };

const AMBIGUOUS =
  'Ambiguous number: use one comma as the decimal separator and no thousands separators.';

/** The point-form text for what a viewer typed. With the setting off, text passes through. */
export function readEntry(raw: string, comma: boolean): Entry {
  if (!comma) return { ok: true, canonical: raw };
  const commas = (raw.match(/,/g) ?? []).length;
  const points = (raw.match(/\./g) ?? []).length;
  if (commas > 1 || (commas === 1 && points > 0)) return { ok: false, message: AMBIGUOUS };
  if (commas === 0 && points > 0) {
    // a lone point is a decimal, except when it looks like a thousands group
    if (points > 1 || /^[+-]?[1-9]\d{0,2}\.\d{3}(?!\d)(?![eE])/.test(raw)) {
      return { ok: false, message: AMBIGUOUS };
    }
  }
  return { ok: true, canonical: raw.replace(',', '.') };
}

/** How a stored point-form value is shown. */
export function showNumber(stored: string, comma: boolean): string {
  return comma ? stored.replace('.', ',') : stored;
}
