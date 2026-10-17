/** The RSL's one-letter toxicity source keys (summary table key line), mapped to named sources. */
export const sourceKeys: Readonly<Record<string, string>> = {
  I: 'IRIS',
  P: 'PPRTV',
  O: 'EPA Office of Pesticide Programs',
  A: 'ATSDR (final)',
  T: 'ATSDR (draft)',
  C: 'Cal EPA OEHHA',
  X: 'PPRTV screening value',
  H: 'HEAST',
  D: 'EPA Office of Water',
  R: 'EPA Office of Research and Development',
  N: 'State of Wisconsin',
  W: 'toxicity equivalence factor applied',
  E: 'relative potency factor applied',
  G: "see the RSL user's guide",
};
