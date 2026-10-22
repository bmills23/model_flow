/**
 * The chemical check every consumer of a screen's result makes (wave N slice N2). A result sent from
 * a screen carries the chemical the screen was set to; a row or run for another chemical must not take
 * it. A result sent before the tag existed is untagged: it is taken as before when the run holds one
 * chemical, and refused when the run holds two or more, because the chemical cannot be told.
 */

/** The tag a sender adds to its feed: the screen's chemical, or nothing where it is blank (typed by hand). */
export function chemicalTag(id: string | undefined): { chemicalId?: string } {
  return id !== undefined && id.trim() !== '' ? { chemicalId: id } : {};
}

/** The text of the problem, or null when the feed may be used for the row's chemical. */
export function feedChemicalProblem(args: {
  /** What the feed is called in the message, for example "transport well result". */
  feed: string;
  /** The chemical the feed carries; undefined or blank when untagged. */
  feedChemical: string | undefined;
  rowId: string;
  /** How many chemicals the risk or cleanup run holds. */
  runCount: number;
  nameOf: (id: string) => string;
}): string | null {
  const { feed, feedChemical, rowId, runCount, nameOf } = args;
  if (feedChemical !== undefined && feedChemical.trim() !== '') {
    if (feedChemical === rowId) return null;
    return `the ${feed} is for ${nameOf(feedChemical)}, not ${nameOf(rowId)}; run its screen with ${nameOf(rowId)} and send the result again`;
  }
  if (runCount >= 2) {
    return `the ${feed} does not record which chemical it was made for, and this run holds ${runCount} chemicals; choose the chemical on its screen and send it again so it carries its chemical`;
  }
  return null;
}
