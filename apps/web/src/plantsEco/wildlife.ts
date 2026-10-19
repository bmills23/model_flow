import {
  backCalculateEcoSsl,
  wildlifeDose,
  type UptakeModel,
  type Warning,
  type WildlifeDoseInput,
} from '@model-flow/engine';
import type { EcosslSubstance } from './ecossl';
import {
  readNumber,
  readOptional,
  type PlantsEcoForm,
  type Section,
  type WildlifeRowForm,
} from './form';

const MG = 1e-6; // kg/kg per mg/kg

/**
 * Relative tolerance within which a back-calculated soil level reproduces the printed Eco-SSL (5 percent). The
 * engine's published-reproduction test uses the same bound; it is not widened here.
 */
export const REPRODUCTION_TOLERANCE = 0.05;

/**
 * Whether the back-calculated soil level reproduces the printed Eco-SSL within the tolerance. Null when the document
 * prints no value for the row (a user row), since there is nothing to reproduce.
 */
export function reproducesPrinted(backCalc: number | null, printed: number | null): boolean | null {
  if (printed === null || printed <= 0) return null;
  if (backCalc === null) return false;
  return Math.abs(backCalc - printed) / printed <= REPRODUCTION_TOLERANCE;
}

export const WILDLIFE_GROUP_LABELS: Record<WildlifeRowForm['group'], string> = {
  avian: 'Bird',
  mammalian: 'Mammal',
};

const text = (x: number | null): string => (x === null ? '' : String(x));

/**
 * Surrogate rows of one Eco-SSL document as editable form rows: the printed derivation inputs with the table
 * and page they come from. A row the document prints NA (no uptake model) has nothing to compute and is left out.
 */
export function wildlifeRowsFor(substance: EcosslSubstance): WildlifeRowForm[] {
  const rows: WildlifeRowForm[] = [];
  for (const w of substance.wildlife) {
    if (w.form === 'NA' || w.a === null) continue;
    rows.push({
      group: w.group,
      surrogate: w.surrogate,
      table: w.table,
      page: String(w.page),
      trv: String(w.trv),
      fir: String(w.fir),
      ps: String(w.ps),
      auf: '1',
      form: w.form,
      a: String(w.a),
      b: text(w.b),
      cdiet: text(w.cdiet),
      printed: text(w.ecoSsl),
    });
  }
  return rows;
}

export interface WildlifeResultRow {
  label: string;
  group: WildlifeRowForm['group'];
  /** Table and page the row was prefilled from, blank for a user row. */
  source: string;
  /** Daily dose, mg per kg body weight per day. */
  doseMgPerKgD: number;
  trvMgPerKgD: number;
  hq: number;
  /** Soil concentration at which this row's hazard quotient is one (for the area use factor entered), mg/kg. */
  backCalcMgPerKg: number | null;
  /** Eco-SSL printed in the document for this surrogate, mg/kg, or null. */
  printedMgPerKg: number | null;
  /** Whether backCalcMgPerKg is within REPRODUCTION_TOLERANCE of the printed value; null when none is printed. */
  reproduces: boolean | null;
}

export interface WildlifeResult {
  rows: WildlifeResultRow[];
  warnings: Warning[];
}

const screeningOnly: Warning = {
  code: 'ECO_SCREENING_ONLY',
  message:
    'Eco-SSLs are screening values for Step 2 of the Superfund ecological process, not cleanup levels',
};

function modelOf(r: WildlifeRowForm, tag: string, errors: string[]): UptakeModel {
  const a = readNumber(r.a, `${tag}, uptake coefficient a`, errors, { min: 'nonneg' });
  if (r.form === 'ln') {
    const b = readNumber(r.b, `${tag}, uptake intercept b`, errors, { min: 'any' });
    return { form: 'ln', a, b };
  }
  const cdiet = readOptional(r.cdiet, `${tag}, diet concentration factor`, errors, {
    min: 'nonneg',
  });
  if (r.form === 'ratio') return { form: 'ratio', a, ...(cdiet === undefined ? {} : { cdiet }) };
  const b = readNumber(r.b, `${tag}, uptake intercept b`, errors, { min: 'any' });
  return { form: 'affine', a, b, ...(cdiet === undefined ? {} : { cdiet }) };
}

/** Site-specific wildlife hazard quotient of each surrogate row at the screen's soil concentration. */
export function computeWildlife(form: PlantsEcoForm): Section<WildlifeResult> {
  if (form.wildlifeRows.length === 0) {
    return {
      ok: false,
      errors: ['Load the surrogate receptors from the Eco-SSL document or add a row'],
    };
  }
  const errors: string[] = [];
  const cs = readNumber(form.soilConcentration, 'Soil concentration (mg/kg)', errors, {
    min: 'nonneg',
  });
  const prepared = form.wildlifeRows.map((r, i) => {
    const label = r.surrogate.trim() === '' ? `Row ${i + 1}` : r.surrogate.trim();
    const tag = `${label} (row ${i + 1})`;
    const trv = readNumber(r.trv, `${tag}, toxicity reference value (mg/kg/d)`, errors);
    const fir = readNumber(r.fir, `${tag}, food ingestion rate (kg/kg/d)`, errors);
    const ps = readNumber(r.ps, `${tag}, soil in the diet`, errors, { min: 'unit' });
    const auf = readNumber(r.auf, `${tag}, area use factor`, errors, { min: 'unit' });
    const model = modelOf(r, tag, errors);
    const printed = readOptional(r.printed, `${tag}, printed Eco-SSL`, errors);
    const input: WildlifeDoseInput = {
      foodIngestion_kg_per_kg_d: fir,
      soilFraction: ps,
      areaUseFactor: auf,
      items: [{ name: label, dietFraction: 1, model }],
      trv_kg_per_kg_d: trv * MG,
    };
    return { r, label, tag, input, trv, printed };
  });
  if (errors.length > 0) return { ok: false, errors };
  const rows: WildlifeResultRow[] = [];
  for (const p of prepared) {
    try {
      const dose = wildlifeDose(p.input, cs * MG);
      const backCalcMgPerKg = ((): number | null => {
        const x = backCalculateEcoSsl(p.input);
        return x === null ? null : x / MG;
      })();
      rows.push({
        label: p.label,
        group: p.r.group,
        source: p.r.table === '' ? '' : `table ${p.r.table}, page ${p.r.page}`,
        doseMgPerKgD: dose / MG,
        trvMgPerKgD: p.trv,
        hq: dose / p.input.trv_kg_per_kg_d,
        backCalcMgPerKg,
        printedMgPerKg: p.printed ?? null,
        reproduces: reproducesPrinted(backCalcMgPerKg, p.printed ?? null),
      });
    } catch (e) {
      errors.push(`${p.tag}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows, warnings: [screeningOnly] };
}
