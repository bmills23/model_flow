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
    return `the ${feed} does not record which chemical it was made for, and this run holds ${runCount} chemicals; send it again from its screen with the chemical set so it carries its chemical`;
  }
  return null;
}

/**
 * The same check for a screen that reads a feed as its own input (household, vapor, groundwater transport).
 * The screen's chemical stands in for the row; the project chemical list stands in for the run, because
 * an untagged feed can be told only when the project holds at most one chemical. A screen with no chemical
 * (typed by hand) has nothing to compare with, so the feed is taken as before.
 */
export function screenFeedProblem(args: {
  feed: string;
  feedChemical: string | undefined;
  /** The chemical the screen is set to; blank when typed by hand. */
  screenChemical: string | undefined;
  /** How many chemicals the project list holds. */
  projectCount: number;
  nameOf: (id: string) => string;
}): string | null {
  const { screenChemical, projectCount, ...rest } = args;
  if (screenChemical === undefined || screenChemical.trim() === '') return null;
  return feedChemicalProblem({ ...rest, rowId: screenChemical, runCount: projectCount });
}

/** Name lookup from the project chemical list, falling back to the id. */
export function projectNameOf(
  list: readonly { id: string; name: string }[],
): (id: string) => string {
  return (id) => list.find((c) => c.id === id)?.name ?? id;
}
