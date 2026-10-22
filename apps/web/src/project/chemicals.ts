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

/** The top-level `chemicals` key of format version 1 (optional; absent means derive it on open). */
export const chemicalsSchema = z.array(projectChemicalSchema);

/** The vapor screen's built-in fixture; it is not a database chemical and never a list entry. */
const FIXTURE_IDS: readonly string[] = ['risc4-benzene'];

interface Candidate {
  id: string;
  name: string;
}

/** Every chemical a screen holds, in a stable order: risk rows, cleanup rows, then each fate screen. */
function candidates(s: Screens): Candidate[] {
  const out: Candidate[] = [];
  const add = (id: string, name = ''): void => {
    const key = id.trim();
    if (key === '' || FIXTURE_IDS.includes(key)) return;
    out.push({ id: key, name: name.trim() });
  };
  for (const r of s.risk.form.chemicals) add(r.id, r.name);
  for (const r of s.cleanup.form.chemicals) add(r.id, r.name);
  add(s.transport.form.chemicalId);
  add(s.vadose.form.chemicalId);
  add(s.saturated.form.chemicalId);
  add(s.vapor.form.chemicalId);
  add(s.household.form.chemicalId, s.household.form.chemicalName);
  add(s.plantsEco.form.chemicalId, s.plantsEco.form.chemicalName);
  return out;
}

/** The chemical ids the screens hold now, de-duplicated in the derivation order. */
export const chemicalIdsOf = (s: Screens): string[] => [...new Set(candidates(s).map((c) => c.id))];

/**
 * The list a project without a `chemicals` key gets: the union of the risk and cleanup rows and every
 * screen's non-blank `chemicalId`, once each. A name comes from the first row that has one (a risk or
 * cleanup row, or the household or plants and eco typed name); a fate screen's id with no row has no
 * name until the database is loaded, so its id stands in for it.
 */
export function deriveChemicals(s: Screens): ProjectChemical[] {
  const byId = new Map<string, ProjectChemical>();
  for (const c of candidates(s)) {
    const known = byId.get(c.id);
    if (known === undefined) byId.set(c.id, { id: c.id, name: c.name });
    else if (known.name === '' && c.name !== '') known.name = c.name;
  }
  return [...byId.values()].map((c) => (c.name === '' ? { id: c.id, name: c.id } : c));
}
