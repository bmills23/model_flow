// The documents the in-app reader offers. Each is a committed Markdown file imported as raw text and
// split into its own chunk, so nothing here weighs on the shell.

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  group: 'Guide' | 'Methods notes' | 'Sources';
  load: () => Promise<string>;
}

const methodFiles = import.meta.glob('../../../../docs/methods/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;
const topFiles = import.meta.glob(
  ['../../../../docs/USER_GUIDE.md', '../../../../docs/ATTRIBUTIONS.md'],
  {
    query: '?raw',
    import: 'default',
  },
) as Record<string, () => Promise<string>>;

const METHOD_NOTES: Record<string, { title: string; summary: string }> = {
  'groundwater-transport': {
    title: 'Groundwater transport',
    summary: 'Dissolved plume equations, the legacy and modern choices, and their validity checks.',
  },
  'vadose-leaching': {
    title: 'Vadose leaching',
    summary: 'Soil-to-groundwater leaching, infiltration and the mass budget.',
  },
  'saturated-soil-source': {
    title: 'Saturated soil source',
    summary: 'Partitioning and the saturated zone source term.',
  },
  'vapor-models': {
    title: 'Vapor intrusion',
    summary: 'Source-to-indoor-air models, attenuation factors and screening.',
  },
  'surface-water': {
    title: 'Surface water and sediment',
    summary: 'Mixing, decay and sediment partitioning, and the criteria data.',
  },
  'exposure-and-risk': {
    title: 'Exposure and risk',
    summary: 'Receptors, pathways, toxicity data and the risk equations.',
  },
  'cleanup-levels': {
    title: 'Cleanup levels',
    summary: 'Back-calculated target concentrations and their limits.',
  },
  'shower-irrigation-particulates': {
    title: 'Shower, irrigation and particulates',
    summary: 'Household water and dust pathways.',
  },
  'plants-and-eco': {
    title: 'Plants, ecology and TPH',
    summary: 'Plant uptake, ecological screening values and petroleum fractions.',
  },
  uncertainty: {
    title: 'Uncertainty analysis',
    summary: 'Distributions, sampling, rank correlation and sensitivity indices.',
  },
  'chemical-database': {
    title: 'Chemical database',
    summary: 'Where chemical properties come from and how they are edited.',
  },
  'projects-and-reports': {
    title: 'Projects, reports and polish',
    summary: 'The project file, sharing, the report and the design checks.',
  },
  'risc5-parameter-map': {
    title: 'Input map from the first prototype',
    summary: 'The input fields and defaults carried over from the earlier prototype.',
  },
};

function slugOf(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

function build(): DocEntry[] {
  const entries: DocEntry[] = [];
  const guide = topFiles['../../../../docs/USER_GUIDE.md'];
  if (guide) {
    entries.push({
      slug: 'user-guide',
      title: 'User guide',
      summary:
        'Every screen, saving and sharing a project, the report, and the legacy and modern switch.',
      group: 'Guide',
      load: guide,
    });
  }
  const methods = Object.entries(methodFiles)
    .map(([path, load]): DocEntry => {
      const slug = slugOf(path);
      const meta = METHOD_NOTES[slug];
      return {
        slug,
        title: meta?.title ?? slug.replace(/-/g, ' '),
        summary: meta?.summary ?? '',
        group: 'Methods notes',
        load,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  entries.push(...methods);
  const attr = topFiles['../../../../docs/ATTRIBUTIONS.md'];
  if (attr) {
    entries.push({
      slug: 'attributions',
      title: 'Attributions',
      summary: 'The science and data behind every method, with the references used.',
      group: 'Sources',
      load: attr,
    });
  }
  return entries;
}

export const docs: DocEntry[] = build();

export function findDoc(slug: string): DocEntry | undefined {
  return docs.find((d) => d.slug === slug);
}

// The hash for a document, and the document a hash names. `#/docs` alone is the index.
export const DOCS_HASH = '#/docs';

export function docHash(slug: string): string {
  return `${DOCS_HASH}/${slug}`;
}

// `#/docs/<slug>` names a document; `#/docs/<slug>/<section>` also names a heading in it.
export function slugFromHash(hash: string): string | null {
  const m = /^#\/docs\/([^/?#]+)(?:\/[^/?#]+)?$/.exec(hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function sectionFromHash(hash: string): string | null {
  const m = /^#\/docs\/[^/?#]+\/([^/?#]+)$/.exec(hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

// Resolve a link written in a document: a web address stays external, a link to another committed
// Markdown file becomes a reader link when that file is offered, anything else has no target.
export function resolveLink(href: string): { kind: 'external' | 'doc' | 'none'; href: string } {
  if (/^https?:\/\//i.test(href)) return { kind: 'external', href };
  const m = /(?:^|\/)([^/#]+)\.md(?:#.*)?$/.exec(href);
  if (m) {
    const slug =
      m[1] === 'USER_GUIDE' ? 'user-guide' : m[1] === 'ATTRIBUTIONS' ? 'attributions' : m[1]!;
    if (findDoc(slug)) return { kind: 'doc', href: docHash(slug) };
  }
  return { kind: 'none', href };
}
