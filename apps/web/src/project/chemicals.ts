import { z } from 'zod';
import { text } from './fields';
import type { Screens } from './index';

/**
 * One chemical of the project list. `id` is the key every screen's `chemicalId` points at (a
 * database id, or for a household chemical the typed id); `name` is what a screen shows. Wave P adds
 * optional keys here for a user-defined chemical (its values, each with a note); an older build strips
 * them with its usual warning.
 */
export const projectChemicalSchema = z.object({
  id: text.refine((s) => s.trim() !== ''),
  name: text,
});
export type ProjectChemical = z.infer<typeof projectChemicalSchema>;

/** The top-level `chemicals` key of the project file (optional; absent means derive it on open). */
export const chemicalsSchema = z.array(projectChemicalSchema);

/** The vapor screen's built-in fixture; it is not a database chemical and never a list entry. */
const FIXTURE_IDS: readonly string[] = ['risc4-benzene'];

interface Candidate {
  id: string;
  name: string;
}

/**
 * Every chemical a screen holds, in a stable order: risk rows, cleanup rows, then each fate screen
 * (the surface water screen last). With `only`, the chemicals that one screen holds.
 */
function candidates(s: Screens, only?: keyof Screens): Candidate[] {
  const out: Candidate[] = [];
  const add = (screen: keyof Screens, id: string, name = ''): void => {
    if (only !== undefined && screen !== only) return;
    const key = id.trim();
    if (key === '' || FIXTURE_IDS.includes(key)) return;
    out.push({ id: key, name: name.trim() });
  };
  for (const r of s.risk.form.chemicals) add('risk', r.id, r.name);
  for (const r of s.cleanup.form.chemicals) add('cleanup', r.id, r.name);
  add('transport', s.transport.form.chemicalId);
  add('vadose', s.vadose.form.chemicalId);
  add('saturated', s.saturated.form.chemicalId);
  add('vapor', s.vapor.form.chemicalId);
  add('household', s.household.form.chemicalId, s.household.form.chemicalName);
  add('plantsEco', s.plantsEco.form.chemicalId, s.plantsEco.form.chemicalName);
  add('surfaceWater', s.surfaceWater.form.chemicalId);
  return out;
}

/** The chemical ids the screens (or the one screen `only`) hold now, de-duplicated in the derivation order. */
export const chemicalIdsOf = (s: Screens, only?: keyof Screens): string[] => [
  ...new Set(candidates(s, only).map((c) => c.id)),
];

/**
 * The list a project without a `chemicals` key gets: the union of the risk and cleanup rows and every
 * screen's non-blank `chemicalId`, once each. A name comes from the first row that has one (a risk or
 * cleanup row, or the household or plants and eco typed name); a fate screen's id with no row has no
 * name until the database is loaded, so its id stands in for it. With `only`, the chemicals that one
 * screen holds.
 */
export function deriveChemicals(s: Screens, only?: keyof Screens): ProjectChemical[] {
  const byId = new Map<string, ProjectChemical>();
  for (const c of candidates(s, only)) {
    const known = byId.get(c.id);
    if (known === undefined) byId.set(c.id, { id: c.id, name: c.name });
    else if (known.name === '' && c.name !== '') known.name = c.name;
  }
  return [...byId.values()].map((c) => (c.name === '' ? { id: c.id, name: c.id } : c));
}
