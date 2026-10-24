// The app-shell part of the mobile check's verdict, kept free of browser and file access so a unit test
// (apps/web/src/mobileCheckShell.test.ts) can run it. A blank page has no overflow and no axe failure
// worse than moderate, so the layout checks alone call it ok; this rule makes it fail.
export const MIN_TEXT = 200;
// Pages of prose (the methods page, the committed documents) have no control, table or chart of their own, and
// the home page is a set of links. They pass on a long text (PROSE_TEXT, the shortest measured is 28,000) or
// on several links (HOME_LINKS, the home page has 15); a blank or half-mounted page has neither.
export const PROSE_TEXT = 5000;
export const HOME_LINKS = 5;

// m carries the counts the in-page measurement takes: navMain (nav[aria-label=Main]), mains (main#main),
// mainH1 (h1 inside main), links (a[href] inside main), controls (input, select, textarea inside main), tables, charts (svg inside main)
// and textLen (length of main's trimmed text). Returns the reasons a view fails; empty means the shell is fine.
export function shellProblems(m) {
  const out = [];
  if (!(m.navMain >= 1)) out.push('no Main navigation');
  if (m.mains !== 1) out.push(`${m.mains} main#main elements (need 1)`);
  if (m.mainH1 < 1) out.push('no h1 inside main');
  const own =
    m.controls + m.tables + m.charts >= 1 || m.links >= HOME_LINKS || m.textLen >= PROSE_TEXT;
  if (!own) out.push('no form control, table, chart, links or long text in main');
  if (m.textLen < MIN_TEXT) out.push(`main text ${m.textLen} chars (need ${MIN_TEXT})`);
  return out;
}
