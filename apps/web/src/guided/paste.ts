import { SOURCE_LABELS } from './chain';
import type { SourceValueKey } from './state';
import { classifyValue, normalizeUnit } from './units';

/**
 * Pasting a table copied from a spreadsheet into step 3b. Tabs separate the cells (commas or semicolons
 * when there is no tab). A header row names the chemical column and the media; a row of units may follow;
 * without a header the columns are the grid's media in the order shown. Not-detected spellings become
 * "ND". Pure: nothing is saved here.
 */

export interface PasteChemical {
  id: string;
  name: string;
  cas?: string;
}

export interface PastedRow {
  chemicalId: string;
  values: Partial<Record<SourceValueKey, string>>;
  note?: string;
  tph?: string;
}

export interface PasteResult {
  rows: PastedRow[];
  units: Partial<Record<SourceValueKey, string>>;
  problems: string[];
}

type Target = { kind: 'medium'; key: SourceValueKey } | { kind: 'note' } | { kind: 'tph' } | null;

const ND = /^(nd|n\.?d\.?|n\/d|not detected|non-?detects?)$/i;
const LESS_THAN = /^<\s*[\d.]/;
const NAME_HEADER =
  /^(chemical|compound|analyte|constituent|parameter|name|cas|cas ?(no|number|#)?)\b/i;
const NOTE_HEADER = /^(notes?|sample|sample notes?|sample id|location|comments?)\b/i;
const TPH_HEADER = /^(tph|total petroleum)/i;

const clean = (s: string): string =>
  s
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map(clean);
}

function mediumOfHeader(text: string): SourceValueKey | null {
  const t = text
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();
  if (t === '') return null;
  let best: { key: SourceValueKey; len: number } | null = null;
  for (const [key, label] of Object.entries(SOURCE_LABELS) as [SourceValueKey, string][]) {
    const l = label.toLowerCase();
    if (t === l) return key;
    if (t.includes(l) && (best === null || l.length > best.len)) best = { key, len: l.length };
  }
  return best?.key ?? null;
}

const unitInParens = (text: string): string | null => /\(([^)]*)\)/.exec(text)?.[1] ?? null;

function isUnitsRow(cells: string[]): boolean {
  if (!/^(units?)?$/i.test(cells[0] ?? '')) return false;
  const rest = cells.slice(1).filter((c) => c !== '');
  return (
    rest.length > 0 &&
    rest.every((c) => classifyValue(c).kind === 'invalid' && /[/]|^ppm$|^ppb$/i.test(c))
  );
}

export function parsePaste(
  text: string,
  columns: readonly SourceValueKey[],
  chemicals: readonly PasteChemical[],
): PasteResult {
  const result: PasteResult = { rows: [], units: {}, problems: [] };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    result.problems.push('Nothing was pasted.');
    return result;
  }
  const delimiter = lines.some((l) => l.includes('\t'))
    ? '\t'
    : lines.some((l) => l.includes(';'))
      ? ';'
      : ',';
  const table = lines.map((l) => splitLine(l, delimiter));

  const first = table[0]!;
  const headerMedia = first.map((c) => mediumOfHeader(c));
  const hasHeader =
    NAME_HEADER.test(first[0] ?? '') || headerMedia.some((m, i) => i > 0 && m !== null);

  let targets: Target[];
  let dataStart = 0;
  if (hasHeader) {
    dataStart = 1;
    targets = first.map((cell, i): Target => {
      if (i === 0) return null;
      const m = headerMedia[i];
      if (m !== null && m !== undefined) {
        if (!columns.includes(m)) {
          result.problems.push(
            `The column "${cell}" is not a medium step 2 asks for, so it was left out.`,
          );
          return null;
        }
        const u = unitInParens(cell);
        if (u !== null) {
          const n = normalizeUnit(u, m);
          if (n === null)
            result.problems.push(
              `The unit "${u}" in the column "${cell}" is not one offered for ${SOURCE_LABELS[m].toLowerCase()}.`,
            );
          else result.units[m] = n;
        }
        return { kind: 'medium', key: m };
      }
      if (TPH_HEADER.test(cell)) return { kind: 'tph' };
      if (NOTE_HEADER.test(cell)) return { kind: 'note' };
      if (cell !== '')
        result.problems.push(`The column "${cell}" was not recognised, so it was left out.`);
      return null;
    });
  } else {
    targets = first.map((_, i): Target => {
      if (i === 0) return null;
      const key = columns[i - 1];
      return key === undefined ? null : { kind: 'medium', key };
    });
  }

  const rowsByChemical = new Map<string, PastedRow>();
  for (let r = dataStart; r < table.length; r++) {
    const cells = table[r]!;
    if (isUnitsRow(cells)) {
      cells.forEach((c, i) => {
        const t = targets[i];
        if (t?.kind !== 'medium' || c === '') return;
        const n = normalizeUnit(c, t.key);
        if (n === null) {
          result.problems.push(
            `The unit "${c}" is not one offered for ${SOURCE_LABELS[t.key].toLowerCase()}.`,
          );
        } else result.units[t.key] = n;
      });
      continue;
    }
    const label = cells[0] ?? '';
    const lower = label.toLowerCase();
    const chem = chemicals.find(
      (c) =>
        c.id.toLowerCase() === lower ||
        (c.cas !== undefined && c.cas.toLowerCase() === lower) ||
        c.name.toLowerCase() === lower,
    );
    if (chem === undefined) {
      result.problems.push(
        `"${label}" is not a chemical in this project, so its row was left out.`,
      );
      continue;
    }
    const row: PastedRow = rowsByChemical.get(chem.id) ?? { chemicalId: chem.id, values: {} };
    let used = false;
    cells.forEach((cell, i) => {
      const t = targets[i];
      if (t === null || t === undefined || cell === '') return;
      if (t.kind === 'note') {
        row.note = cell;
        used = true;
        return;
      }
      let v = cell;
      if (ND.test(v) || LESS_THAN.test(v)) v = 'ND';
      const c = classifyValue(v);
      if (c.kind === 'invalid') {
        result.problems.push(
          `"${cell}" for ${chem.name} is not a number above zero or ND, so it was left out.`,
        );
        return;
      }
      if (t.kind === 'tph') {
        row.tph = v;
      } else {
        row.values[t.key] = v;
      }
      used = true;
    });
    if (used) rowsByChemical.set(chem.id, row);
  }
  result.rows = [...rowsByChemical.values()];
  return result;
}
