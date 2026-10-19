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
