import { MODEL_WORDS } from './derive';
import { OUTPUT_MODEL } from './hash';
import type { OutputCheck } from './status';
import type { RunInputRow } from '../project/runInputs';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { GuidedOutputs } from './state';
import { indoorSeries, type RunChemical } from './runCsv';

/** What the step 3d results screen shows, as plain data (no store, no React). */

export interface StaleReport {
  /** The models whose results no longer match their inputs, each with the chemicals affected. */
  changed: { model: string; chemicals: string[] }[];
  /** Chemicals with no result yet from a model the site model uses. */
  missing: string[];
}

/** Which results are out of date, in the words of the models, or null when all are current. */
export function staleReport(
  feeds: readonly string[],
  chemicals: readonly RunChemical[],
  check: OutputCheck,
): StaleReport | null {
  const changed = new Map<string, Set<string>>();
  const missing = new Set<string>();
  for (const c of chemicals) {
    for (const feed of feeds) {
      const state = check(feed, c.id);
      if (state === 'missing') missing.add(c.name);
      if (state !== 'stale') continue;
      const m = OUTPUT_MODEL[feed];
      const words = m === undefined ? feed : MODEL_WORDS[m];
      (changed.get(words) ?? changed.set(words, new Set()).get(words)!).add(c.name);
    }
  }
  if (changed.size === 0 && missing.size === 0) return null;
  return {
    changed: [...changed].map(([model, names]) => ({ model, chemicals: [...names] })),
    missing: [...missing],
  };
}

/** The stale report as a sentence. */
export function staleSentence(r: StaleReport): string {
  const parts: string[] = [];
  if (r.changed.length > 0) {
    parts.push(
      `The inputs changed for the ${r.changed
        .map((c) => `${c.model} (${c.chemicals.join(', ')})`)
        .join('; the ')}, so their results no longer match`,
    );
  }
  if (r.missing.length > 0) parts.push(`No result yet for ${r.missing.join(', ')}`);
  return parts.join('. ') + '.';
}

export interface IndoorAirRow {
  chemical: string;
  peakMgPerM3: number;
  /** The source this chemical's indoor air started from, as the Run recorded it. */
  source: string;
  method: string;
}

const rowValue = (rows: readonly RunInputRow[] | undefined, label: string): string | undefined =>
  rows?.find((r) => r.label === label)?.value;

export function indoorAirRows(
  outputs: GuidedOutputs,
  chemicals: readonly RunChemical[],
): IndoorAirRow[] {
  const out: IndoorAirRow[] = [];
  for (const c of chemicals) {
    const feed = outputs['vaporRisk']?.[c.id]?.value as VaporRiskFeed | undefined;
    const series = feed === undefined ? null : indoorSeries(feed);
    if (feed === undefined || series === null) continue;
    out.push({
      chemical: c.name,
      peakMgPerM3: Math.max(...series.mgPerM3),
      source:
        rowValue(feed.runInputs, 'Source') ??
        rowValue(feed.runInputs, 'Source medium') ??
        'not recorded',
      method: rowValue(feed.runInputs, 'Indoor air method') ?? 'not recorded',
    });
  }
  return out;
}

/** The recorded inputs of each model's result for one chemical, in the order the Run's chain lists them. */
export function inputBlocks(
  outputs: GuidedOutputs,
  chemicalId: string,
): { model: string; rows: RunInputRow[] }[] {
  const seen = new Set<string>();
  const blocks: { model: string; rows: RunInputRow[] }[] = [];
  for (const [feed, slots] of Object.entries(outputs)) {
    const value = slots[chemicalId]?.value as { runInputs?: RunInputRow[] } | undefined;
    const rows = value?.runInputs;
    const m = OUTPUT_MODEL[feed];
    if (rows === undefined || rows.length === 0 || m === undefined || seen.has(m)) continue;
    seen.add(m);
    blocks.push({ model: MODEL_WORDS[m], rows });
  }
  return blocks;
}
