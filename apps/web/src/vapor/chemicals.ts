import type { VaporForm } from './form';

/** The slice of a vapor-chemicals.json row the screen uses. */
export interface VaporChemicalRow {
  id: string;
  name: string;
  rsl: {
    mw?: { value: number };
    hPrime?: { value: number };
    dia?: { value: number };
    diw?: { value: number };
    koc?: { value: number };
    s?: { value: number };
  };
  epa2004je?: { tbK?: number; tcK?: number; dhvbCalPerMol?: number };
}

export interface VaporChemicalsFile {
  chemicals: VaporChemicalRow[];
}

let loading: Promise<VaporChemicalRow[]> | null = null;

/** Loads the derived chemical file on first use; the bundler puts it in a chunk of its own. */
export function loadVaporChemicals(): Promise<VaporChemicalRow[]> {
  loading ??= import('@model-flow/data/generated/vapor/vapor-chemicals.json').then(
    (m) => (m.default as unknown as VaporChemicalsFile).chemicals,
  );
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

const str = (v: number | undefined): string => (v === undefined ? '' : String(v));

/** The chemical fields of the form for a database row (RSL values first, EPA 2004 thermo data when present). */
export function chemicalFields(
  row: VaporChemicalRow,
): Pick<VaporForm, 'chemicalId' | 'M' | 'S' | 'H' | 'Koc' | 'Da' | 'Dw' | 'TB' | 'TC' | 'dHvb'> {
  const e = row.epa2004je;
  const thermo =
    e?.tbK !== undefined && e.tcK !== undefined && e.dhvbCalPerMol !== undefined ? e : undefined;
  return {
    chemicalId: row.id,
    M: str(row.rsl.mw?.value),
    S: str(row.rsl.s?.value),
    H: str(row.rsl.hPrime?.value),
    Koc: str(row.rsl.koc?.value),
    Da: str(row.rsl.dia?.value),
    Dw: str(row.rsl.diw?.value),
    TB: str(thermo?.tbK),
    TC: str(thermo?.tcK),
    dHvb: str(thermo?.dhvbCalPerMol),
  };
}
