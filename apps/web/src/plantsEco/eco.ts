import {
  runBenchmarkScreen,
  runEcosslScreen,
  type EcoGroup,
  type Warning,
} from '@model-flow/engine';
import { sslEntries, type EcosslSubstance } from './ecossl';
import { readNumber, type PlantsEcoForm, type Section } from './form';

export const ECO_LEGACY_ID = 'eco.benchmark-hq';
export const ECO_MODERN_ID = 'eco.ecossl-2005';

export const GROUP_LABELS: Record<EcoGroup, string> = {
  plants: 'Plants',
  invertebrates: 'Soil invertebrates',
  avian: 'Birds (wildlife)',
  mammalian: 'Mammals (wildlife)',
};

export interface EcosslRow {
  group: EcoGroup;
  label: string;
  status: 'value' | 'NA' | 'NC' | 'procedure';
  /** Eco-SSL, mg/kg dry weight. */
  sslMgPerKg: number | null;
  hq: number | null;
}

export interface EcosslResult {
  substance: string;
  note: string | null;
  combined: boolean;
  rows: EcosslRow[];
  warnings: Warning[];
}

/** Hazard quotients of the soil concentration over the Eco-SSLs of the chemical's substance. */
export function computeEcossl(
  form: PlantsEcoForm,
  substance: EcosslSubstance | undefined,
): Section<{ result: EcosslResult }> {
  const errors: string[] = [];
  const cs = readNumber(form.soilConcentration, 'Soil concentration (mg/kg)', errors, {
    min: 'nonneg',
  });
  if (substance === undefined) {
    errors.push('This chemical has no Eco-SSL document in the data');
  }
  if (errors.length > 0 || substance === undefined) return { ok: false, errors };
  const r = runEcosslScreen({ soil_kg_per_kg: cs * 1e-6, ssl: sslEntries(substance) });
  return {
    ok: true,
    result: {
      substance: substance.name,
      note: substance.note,
      combined: substance.chemicalIds.length > 1,
      warnings: r.warnings,
      rows: r.rows.map((row) => {
        const v = substance.values[row.group];
        return {
          group: row.group,
          label: GROUP_LABELS[row.group],
          status: v.status,
          sslMgPerKg: v.value,
          hq: row.hq,
        };
      }),
    },
  };
}

export interface BenchmarkHqRow {
  receptor: string;
  citation: string;
  valueMgPerKg: number;
  hq: number;
}

/** Legacy screen: user-entered benchmarks with their citations. A row with every field blank is ignored. */
export function computeBenchmarks(
  form: PlantsEcoForm,
): Section<{ rows: BenchmarkHqRow[]; warnings: Warning[] }> {
  const errors: string[] = [];
  const used = form.benchmarks.filter(
    (b) => b.receptor.trim() !== '' || b.value.trim() !== '' || b.citation.trim() !== '',
  );
  if (used.length === 0) {
    return { ok: false, errors: ['Add a benchmark with its value and citation'] };
  }
  const cs = readNumber(form.soilConcentration, 'Soil concentration (mg/kg)', errors, {
    min: 'nonneg',
  });
  const benchmarks = used.map((b, i) => {
    const tag = `Benchmark ${i + 1}`;
    const receptor = b.receptor.trim();
    if (receptor === '') errors.push(`${tag}: name the receptor`);
    if (b.citation.trim() === '') errors.push(`${tag}: a citation is required`);
    const value = readNumber(b.value, `${tag}, value (mg/kg)`, errors);
    return { receptor, citation: b.citation.trim(), value_kg_per_kg: value * 1e-6, value };
  });
  if (errors.length > 0) return { ok: false, errors };
  const r = runBenchmarkScreen({ soil_kg_per_kg: cs * 1e-6, benchmarks });
  return {
    ok: true,
    rows: r.benchmarkRows.map((row, i) => ({
      receptor: row.receptor,
      citation: row.citation,
      valueMgPerKg: benchmarks[i]!.value,
      hq: row.hq,
    })),
    warnings: r.warnings,
  };
}
