// The pass condition for the guided result screens (step 5 targets, step 6 results) after the step 3d Run, kept
// free of browser access so a unit test (apps/web/src/mobileCheckGuided.test.ts) can run it. A blank screen has no
// overflow, so the layout checks alone call it ok; this rule makes it fail.
// m carries: tables (table elements in main), notQuantified (a "not quantified" statement in main), loading
// (main shows a "Loading ..." message), alerts (texts of the role=alert elements in main) and textLen.
export function guidedResultProblems(m) {
  const out = [];
  if (m.loading) out.push('still shows a loading message');
  for (const a of m.alerts ?? []) out.push(`alert: ${String(a).slice(0, 200)}`);
  if (!(m.tables >= 1 || m.notQuantified)) {
    out.push(
      `no result table and no "not quantified" reason (tables=${m.tables}, text=${m.textLen})`,
    );
  }
  return out;
}
export const GUIDED_RESULT_ROUTES = ['#/step/targets', '#/step/results'];
