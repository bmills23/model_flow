import { ECO_GROUPS, type EcoGroup, type SslEntry } from '@model-flow/engine';

/** The slice of the generated Eco-SSL file the screen reads (mg/kg dry weight in soil). */
export interface EcosslSubstance {
  substance: string;
  name: string;
  chemicalIds: string[];
  note: string | null;
  values: Record<EcoGroup, { status: 'value' | 'NA' | 'NC' | 'procedure'; value: number | null }>;
}

export interface EcosslFile {
  substances: EcosslSubstance[];
}

let loading: Promise<EcosslSubstance[]> | null = null;

/** Loads the generated Eco-SSL file on first use; its own chunk, like the RSL files. */
export function loadEcossl(): Promise<EcosslSubstance[]> {
  loading ??= import('@model-flow/data/generated/ecossl-2026-10-18/ecossl.json').then(
    (m) => (m.default as unknown as EcosslFile).substances,
  );
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** The Eco-SSL substance a database record id maps to, or undefined (also for the two unmapped PAH groups). */
export function substanceFor(
  substances: readonly EcosslSubstance[],
  chemicalId: string,
): EcosslSubstance | undefined {
  return substances.find((s) => s.chemicalIds.includes(chemicalId));
}

/** Eco-SSL entries in kg/kg dry weight, the engine's unit. */
export function sslEntries(s: EcosslSubstance): Record<EcoGroup, SslEntry> {
  const out = {} as Record<EcoGroup, SslEntry>;
  for (const g of ECO_GROUPS) {
    const v = s.values[g];
    out[g] = { status: v.status, value: v.value === null ? null : v.value * 1e-6 };
  }
  return out;
}
