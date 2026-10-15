import type { MethodDescriptor, Reference } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { renderAttributions } from '../src/attributions.js';
import { renderThirdPartyLicenses, type PnpmLicenseReport } from '../src/licenses.js';

const refs: Reference[] = [
  {
    key: 'yeh1981',
    type: 'method',
    status: 'used',
    authors: 'Yeh, G.T.',
    year: 1981,
    title:
      'AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system',
    venue: 'Oak Ridge National Laboratory',
    identifier: 'ORNL-5602',
    tags: ['groundwater'],
  },
  {
    key: 'falta2005',
    type: 'method',
    status: 'planned',
    authors: 'Falta, R.W., Rao, P.S., Basu, N.',
    year: 2005,
    title:
      'Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response',
    venue: 'Journal of Contaminant Hydrology',
    identifier: '78:259-280',
    doi: '10.1016/j.jconhyd.2005.05.010',
    tags: ['groundwater'],
  },
  {
    key: 'epa2025rsl',
    type: 'data',
    status: 'data',
    authors: 'U.S. Environmental Protection Agency',
    year: 2025,
    title: 'Regional Screening Levels (RSLs), Generic Tables',
    url: 'https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables',
    tags: ['chemistry', 'toxicity'],
  },
  {
    key: 'arcadis2001',
    type: 'review',
    status: 'fixture',
    authors: 'Arcadis Geraghty & Miller',
    year: 2001,
    title: 'Review of Risk Integrated Software for Cleanups (RISC) v4.0',
    tags: ['validation'],
  },
];

const methods: MethodDescriptor<unknown, unknown>[] = [
  {
    id: 'groundwater.at123d',
    process: 'groundwater',
    kind: 'legacy',
    name: 'AT123D Green-function solution',
    summary: 'Three-dimensional dispersion, one-dimensional flow, first-order decay.',
    citations: ['yeh1981'],
    assumptions: ['Infinite aquifer width and depth'],
    risc5Choice: 'Concentration input converted to mass loading.',
    run: () => undefined,
  },
];

describe('renderAttributions', () => {
  const md = renderAttributions({ methods, references: refs, generatedOn: '2026-10-15' });

  it('has the expected sections in order', () => {
    const order = [
      '# Attributions',
      '## Methods by process',
      '## Planned methods',
      '## Data sources',
      '## Validation sources',
      '## References',
    ].map((h) => md.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('lists each method with its kind, assumptions, RISC5 choice and full citation', () => {
    const methodsSection = md.slice(
      md.indexOf('## Methods by process'),
      md.indexOf('## Planned methods'),
    );
    expect(methodsSection).toContain('AT123D Green-function solution');
    expect(methodsSection).toContain('Legacy');
    expect(methodsSection).toContain('Infinite aquifer width and depth');
    expect(methodsSection).toContain('Concentration input converted to mass loading.');
    expect(methodsSection).toContain('Yeh, G.T. (1981)');
  });

  it('keeps planned references out of the methods section and in the planned section', () => {
    const methodsSection = md.slice(
      md.indexOf('## Methods by process'),
      md.indexOf('## Planned methods'),
    );
    const planned = md.slice(md.indexOf('## Planned methods'), md.indexOf('## Data sources'));
    expect(methodsSection).not.toContain('Falta');
    expect(planned).toContain('Falta, R.W., Rao, P.S., Basu, N. (2005)');
  });

  it('renders DOIs and URLs as links in the reference list', () => {
    const list = md.slice(md.indexOf('## References'));
    expect(list).toContain('https://doi.org/10.1016/j.jconhyd.2005.05.010');
    expect(list).toContain(
      'https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables',
    );
  });

  it('separates software licences: they are not part of this document', () => {
    expect(md).not.toMatch(/MIT License|Apache-2\.0/);
    expect(md).toContain('THIRD_PARTY_LICENSES.md');
  });
});

describe('renderThirdPartyLicenses', () => {
  const report: PnpmLicenseReport = {
    'Apache-2.0': [
      {
        name: '@stdlib/math-base-special-erfc',
        versions: ['0.2.5'],
        license: 'Apache-2.0',
        homepage: 'https://stdlib.io',
        author: 'The Stdlib Authors',
      },
    ],
    MIT: [
      { name: 'react', versions: ['19.3.1'], license: 'MIT', homepage: 'https://react.dev' },
      { name: 'zod', versions: ['4.6.7'], license: 'MIT' },
    ],
  };
  const md = renderThirdPartyLicenses({ report, generatedOn: '2026-10-15' });

  it('groups packages under their licence with name and version', () => {
    expect(md).toContain('## Apache-2.0');
    expect(md).toContain('## MIT');
    expect(md).toContain('@stdlib/math-base-special-erfc 0.2.5');
    expect(md).toContain('react 19.3.1');
    expect(md.indexOf('## Apache-2.0')).toBeLessThan(md.indexOf('## MIT'));
  });

  it('points to ATTRIBUTIONS.md for the science and keeps science out of this document', () => {
    expect(md).toContain('ATTRIBUTIONS.md');
    expect(md).not.toContain('Yeh');
  });
});
