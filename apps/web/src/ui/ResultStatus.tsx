/**
 * The status line of a fate screen's results. The results count as current only when they were
 * computed from the inputs now on screen: while a run is pending the line says so, and while the
 * inputs have a problem (a field error, an engine input error, a broken link) it says the results
 * are out of date. "Up to date" is never shown in either case.
 */
export function ResultStatus({
  computing,
  problem,
}: {
  computing: boolean;
  /** True when the inputs on screen cannot be run (field error, engine error, broken link). */
  problem: boolean;
}) {
  const text = computing ? 'Computing...' : problem ? 'Out of date' : 'Up to date';
  return (
    <p
      className={computing ? 'status on' : problem ? 'status stale-status' : 'status'}
      role="status"
    >
      {text}
    </p>
  );
}

/**
 * A note placed above results that are still on screen although the inputs no longer match them.
 * `reasons` says what changed (the input errors); the results below are the last valid run.
 */
export function StaleResultsNote({ reasons }: { reasons: readonly string[] }) {
  return (
    <p className="note stale-results-note">
      <strong>These results are out of date.</strong> They were computed from earlier inputs, and
      the inputs now on screen cannot be run
      {reasons.length > 0 ? `: ${reasons.join('; ')}` : ''}. Fix the inputs to update them. Sending
      and downloading are off until then.
    </p>
  );
}
