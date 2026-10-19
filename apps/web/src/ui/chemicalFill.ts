import { useEffect, useState } from 'react';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';

/** The fate properties of the form fields that an RSL record can fill, as typed strings. */
export interface FateFill {
  M?: string;
  S?: string;
  H?: string;
  Koc?: string;
  Da?: string;
  Dw?: string;
}

const text = (v: number | undefined): string | undefined =>
  v === undefined ? undefined : String(v);

/**
 * The properties a database row carries, in form units (g/mol, mg/L, dimensionless, mL/g, cm2/s).
 * A property the record lacks is left out so the caller keeps the value already in the form.
 */
export function fateFill(row: VaporChemicalRow): FateFill {
  const out: FateFill = {};
  const put = (key: keyof FateFill, v: number | undefined): void => {
    const s = text(v);
    if (s !== undefined) out[key] = s;
  };
  put('M', row.rsl.mw?.value);
  put('S', row.rsl.s?.value);
  put('H', row.rsl.hPrime?.value);
  put('Koc', row.rsl.koc?.value);
  put('Da', row.rsl.dia?.value);
  put('Dw', row.rsl.diw?.value);
  return out;
}

/** Loads the shared chemical database once per page; `failed` is true when it did not load. */
export function useChemicalRows(): { rows: VaporChemicalRow[]; failed: boolean } {
  const [rows, setRows] = useState<VaporChemicalRow[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadVaporChemicals().then(
      (r) => {
        if (live) setRows(r);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return { rows, failed };
}
