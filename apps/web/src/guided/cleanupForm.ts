import { buildCleanup, type CleanupBuildResult } from '../cleanup/build';
import { defaultCleanupForm, type CleanupForm, type SourceKind } from '../cleanup/form';
import type { ChemicalDb } from '../risk/chemicalDb';
import type { OverridesState } from '../overrides/model';
import { withReceptorEdits } from '../overrides/receptors';
import { runPlan } from './derive';
import { guidedReceptors, guidedRows, type GuidedChemicalRef } from './riskForm';
import { riskFeeds } from './slots';
import type { GuidedState } from './state';
import { classifyValue, sourceNumber } from './units';

/**
 * The cleanup form step 5 derives from the guided answers: the source kind the chain implies, the rows
 * and receptors the risk form uses (`riskForm.ts`), and the allocation and targets of step 5. A water
 * standard is per chemical, so `cleanupFormFor` narrows the form to one chemical with its own target.
 * Pure: no store, no engine call.
 */

/** Where the level is solved: the medium contacted, or the source the transport run starts from. */
export function cleanupSourceKind(guided: GuidedState): SourceKind {
  const t = runPlan(guided)?.transportSource ?? null;
  return t === 'groundwater'
    ? 'dissolved'
    : t === 'soilAbove'
      ? 'vadose'
      : t === 'soilBelow'
        ? 'saturated'
        : 'direct';
}

const numText = (v: number): string => String(Number(v.toPrecision(12)));

export function deriveCleanupForm(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
  overrides?: OverridesState,
): CleanupForm {
  const { a, b } = guidedReceptors(guided);
  const form: CleanupForm = {
    ...defaultCleanupForm(),
    source: cleanupSourceKind(guided),
    chemicals: guidedRows(guided, chemicals, db),
    surfaceTargets: [],
    a,
    b,
    additive: guided.exposure.additive,
    allocation: guided.targets.allocation,
    targetRisk: guided.targets.targetRisk,
    targetHq: guided.targets.targetHq,
  };
  return overrides === undefined ? form : withReceptorEdits(form, overrides, 'guided');
}

/**
 * The form for one chemical with its own target: risk and hazard, a federal MCL (the well target stays
 * blank, so the database value is used), or a state standard as a concentration at the well in mg/L. A
 * state standard with no usable value or unit is '0', which the build refuses with "enter a number above
 * zero" and never falls back to the MCL.
 */
export function cleanupFormFor(
  form: CleanupForm,
  guided: GuidedState,
  chemicalId: string,
): CleanupForm {
  const row = form.chemicals.find((c) => c.id === chemicalId);
  const base: CleanupForm = { ...form, chemicals: row === undefined ? [] : [row] };
  const std = guided.targets.standards[chemicalId];
  if (std === undefined || std.kind === 'risk')
    return { ...base, targetKind: 'risk', wellTarget: '' };
  if (std.kind === 'mcl') return { ...base, targetKind: 'well', wellTarget: '' };
  // a standard is a plain number: ND and a below-limit value are sample readings, not standards
  const n =
    classifyValue(std.value).kind === 'number'
      ? sourceNumber(std.value, std.unit, 'groundwater')
      : null;
  return { ...base, targetKind: 'well', wellTarget: n === null ? '0' : numText(n) };
}

/** The back-calculation inputs of the guided project: the derived form over the Run's produce results. */
export function buildGuidedCleanup(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
  overrides?: OverridesState,
): CleanupBuildResult {
  return buildCleanup(deriveCleanupForm(guided, chemicals, db, overrides), db, {
    produce: riskFeeds(guided.outputs).produce,
  });
}
