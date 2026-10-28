// The six-step bar. Each step's `href` is the single place its target route is defined; later slices
// retarget a step by changing that one line (Chemicals to '#/chemicals', Site model to '#/site').
// `owns` lists the route hashes that light the step as current; every screen route belongs to exactly
// one step. The fate screens belong to Transport. Home, Methods and Documentation own no step.

export interface Step {
  label: string;
  href: string;
  owns: readonly string[];
}

export const STEPS: readonly Step[] = [
  { label: 'Chemicals', href: '#/chemicals', owns: ['#/chemicals'] },
  { label: 'Site model', href: '#/site', owns: ['#/site'] },
  {
    label: 'Transport',
    href: '#/transport',
    owns: [
      '#/transport',
      '#/vadose',
      '#/saturated',
      '#/vapor',
      '#/surface-water',
      '#/household',
      '#/plants-eco',
    ],
  },
  { label: 'Receptors', href: '#/risk', owns: ['#/risk'] },
  { label: 'Risk & cleanup', href: '#/cleanup', owns: ['#/cleanup'] },
  { label: 'Results', href: '#/report', owns: ['#/report'] },
];

export function stepForHash(hash: string): Step | undefined {
  return STEPS.find((s) => s.owns.includes(hash));
}

// The guided flow's step list (wave AC). `id` is the route slug: a step opens at `#/step/<id>`. Every
// step opens from the list at any time. A step that is not built yet has `arrives` set, so the list shows
// it as arriving with the next update. The main navigation above stays as it is.

export type GuidedStepId =
  | 'chemicals'
  | 'site'
  | 'properties'
  | 'sources'
  | 'run'
  | 'pathways'
  | 'receptors'
  | 'toxicity'
  | 'targets'
  | 'results';

export interface GuidedStep {
  id: GuidedStepId;
  /** The step's number as the plan names it, for example "3a". */
  number: string;
  label: string;
  /** True while the screen is not built yet. */
  arrives: boolean;
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
  { id: 'chemicals', number: '1', label: 'Chemicals', arrives: false },
  { id: 'site', number: '2', label: 'Site model', arrives: false },
  { id: 'properties', number: '3a', label: 'Site properties', arrives: false },
  { id: 'sources', number: '3b, 3c', label: 'Source values', arrives: false },
  { id: 'run', number: '3d', label: 'Run and view', arrives: false },
  { id: 'pathways', number: '4a', label: 'Pathways', arrives: false },
  { id: 'receptors', number: '4b', label: 'Receptors', arrives: false },
  { id: 'toxicity', number: '4c', label: 'Toxicity', arrives: false },
  { id: 'targets', number: '5', label: 'Risk or cleanup', arrives: true },
  { id: 'results', number: '6', label: 'Results', arrives: true },
];

export const GUIDED_HASH_PREFIX = '#/step/';

export const guidedHref = (id: GuidedStepId): string => `${GUIDED_HASH_PREFIX}${id}`;

/** The guided step a route hash opens, or undefined for any other route. */
export function guidedStepForHash(hash: string): GuidedStep | undefined {
  if (!hash.startsWith(GUIDED_HASH_PREFIX)) return undefined;
  const slug = hash.slice(GUIDED_HASH_PREFIX.length);
  return GUIDED_STEPS.find((s) => s.id === slug);
}
