/**
 * Additivity rules of the forward risk calculation (RAGS Part A chapter 8, `rags1989`; RISC5 choices
 * where noted in `docs/methods/exposure-and-risk.md`):
 *
 * - Within one receptor, cancer risks sum over pathways and chemicals, and hazard quotients sum over
 *   pathways and chemicals into the hazard index. Life-stage hazard quotients are never added to each
 *   other; the receptor's headline hazard index is the largest group's.
 * - Across receptors nothing is summed, except under the additive option, which adds the receptors'
 *   cancer risks (the RISC5 way of building a child plus adult resident). Hazard indices are never
 *   added across receptors.
 * - The additive option cannot be combined with an age-segmented receptor, which already covers a child
 *   and an adult and would be counted twice.
 * - No target-organ grouping: the hazard index is a total over all target organs.
 */

/** Throws a RangeError when the additive option is asked for with an age-segmented receptor. */
export function assertAdditiveAllowed(segmented: readonly boolean[]): void {
  if (segmented.some(Boolean)) {
    throw new RangeError(
      'the additive option cannot be used with an age-segmented receptor (it would count the child twice)',
    );
  }
}

/** A and B cancer risks summed; the only quantity that ever adds across receptors. */
export function additiveCancerRisk(cancerRisks: readonly number[]): number {
  return cancerRisks.reduce((s, r) => s + r, 0);
}
