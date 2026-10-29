// The six-step bar of the main navigation (wave AC). Each step's `href` is the single place its target
// route is defined. `owns` lists the route hashes that light the step as current: a step with several
// screens (3a to 3d, 4a to 4c) owns all of them. The model workbench routes belong to no step; they are
// listed in WORKBENCH_ROUTES and open from `#/workbench`.

export interface Step {
  label: string;
  href: string;
  owns: readonly string[];
}

export const STEPS: readonly Step[] = [
  { label: 'Chemicals', href: '#/step/chemicals', owns: ['#/step/chemicals'] },
  { label: 'Site model', href: '#/step/site', owns: ['#/step/site'] },
  {
    label: 'Site values and run',
    href: '#/step/properties',
    owns: ['#/step/properties', '#/step/sources', '#/step/run'],
  },
  {
    label: 'Pathways and receptors',
    href: '#/step/pathways',
    owns: ['#/step/pathways', '#/step/receptors', '#/step/toxicity'],
  },
  { label: 'Risk or cleanup', href: '#/step/targets', owns: ['#/step/targets'] },
  { label: 'Results', href: '#/step/results', owns: ['#/step/results'] },
];

export function stepForHash(hash: string): Step | undefined {
  return STEPS.find((s) => s.owns.includes(hash));
}

/** The model workbench's own page. Its runs do not feed the steps. */
export const WORKBENCH_HASH = '#/workbench';
/** Today's report, printed through the workbench source whatever the steps hold. */
export const WORKBENCH_REPORT_HASH = '#/workbench/report';

export interface WorkbenchRoute {
  href: string;
  label: string;
  /** One line under the link on the workbench page. */
  about: string;
}

/** Every model screen that sits outside the steps, in the order the workbench lists them. */
export const WORKBENCH_ROUTES: readonly WorkbenchRoute[] = [
  {
    href: '#/transport',
    label: 'Groundwater transport',
    about: 'Concentration over time at a receptor well.',
  },
  {
    href: '#/vadose',
    label: 'Vadose leaching',
    about: 'Leaching from soil above the water table.',
  },
  {
    href: '#/saturated',
    label: 'Saturated soil source',
    about: 'Soil below the water table as a source.',
  },
  {
    href: '#/vapor',
    label: 'Vapor intrusion',
    about: 'Vapor from soil gas or groundwater into a building.',
  },
  {
    href: '#/surface-water',
    label: 'Surface water and sediment',
    about: 'A stream that receives groundwater.',
  },
  {
    href: '#/household',
    label: 'Shower, irrigation and particulates',
    about: 'Household water use and dust.',
  },
  {
    href: '#/plants-eco',
    label: 'Plants, ecology and TPH',
    about: 'Plant uptake, ecological screening and TPH.',
  },
  {
    href: '#/risk',
    label: 'Exposure and risk',
    about: 'Cancer risk and hazard from the values you enter.',
  },
  { href: '#/cleanup', label: 'Cleanup levels', about: 'Concentrations that meet a target risk.' },
  {
    href: WORKBENCH_REPORT_HASH,
    label: 'Workbench report',
    about: 'The report of the workbench screens, whatever the steps hold.',
  },
  { href: '#/validation', label: 'Validation', about: 'What the tests reproduce.' },
  { href: '#/methods', label: 'Methods and references', about: 'How each calculation is sourced.' },
];

/** True for the workbench page and every route listed on it. */
export function isWorkbenchHash(hash: string): boolean {
  return hash === WORKBENCH_HASH || WORKBENCH_ROUTES.some((r) => r.href === hash);
}

/** Old routes that moved into the steps: the hash they open now. */
export const ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  '#/site': '#/step/site',
  '#/chemicals': '#/step/chemicals',
};

/** The route to show for a hash, after the redirects. */
export function redirectedHash(hash: string): string {
  return ROUTE_REDIRECTS[hash] ?? hash;
}

// The guided flow's step list (wave AC). `id` is the route slug: a step opens at `#/step/<id>`. Every
// step opens from the list at any time.

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
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
  { id: 'chemicals', number: '1', label: 'Chemicals' },
  { id: 'site', number: '2', label: 'Site model' },
  { id: 'properties', number: '3a', label: 'Site properties' },
  { id: 'sources', number: '3b, 3c', label: 'Source values' },
  { id: 'run', number: '3d', label: 'Run and view' },
  { id: 'pathways', number: '4a', label: 'Pathways' },
  { id: 'receptors', number: '4b', label: 'Receptors' },
  { id: 'toxicity', number: '4c', label: 'Toxicity' },
  { id: 'targets', number: '5', label: 'Risk or cleanup' },
  { id: 'results', number: '6', label: 'Results' },
];

export const GUIDED_HASH_PREFIX = '#/step/';

export const guidedHref = (id: GuidedStepId): string => `${GUIDED_HASH_PREFIX}${id}`;

/** The guided step a route hash opens, or undefined for any other route. */
export function guidedStepForHash(hash: string): GuidedStep | undefined {
  if (!hash.startsWith(GUIDED_HASH_PREFIX)) return undefined;
  const slug = hash.slice(GUIDED_HASH_PREFIX.length);
  return GUIDED_STEPS.find((s) => s.id === slug);
}
