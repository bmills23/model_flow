/** The EPA Eco-SSL documents. Directive numbers and dates are read from each document's cover page. */

export interface EcosslDocument {
  /** Short key, also the stem of the published file name. */
  key: string;
  /** File name as the EPA serves it. */
  file: string;
  /** Substances (see values.csv) this document supplies. */
  substances: string[];
  /** OSWER Directive number printed on the cover. */
  directive: string;
  /** Cover date, YYYY-MM. */
  date: string;
  /** Revision date printed on the cover, YYYY-MM, when there is one. */
  revised?: string;
}

const base = 'https://www.epa.gov/sites/default/files/2015-09/documents/';

export const documentUrl = (file: string): string => base + file;

export const GUIDANCE_FILE = 'ecossl_guidance_chapters.pdf';

/** Guidance for Developing Ecological Soil Screening Levels (cover: November 2003, revised February 2005). */
export const GUIDANCE = { directive: '9285.7-55', date: '2003-11', revised: '2005-02' } as const;

export const DOCUMENTS: readonly EcosslDocument[] = [
  {
    key: 'aluminum',
    file: 'eco-ssl_aluminum.pdf',
    substances: ['aluminum'],
    directive: '9285.7-60',
    date: '2003-11',
  },
  {
    key: 'antimony',
    file: 'eco-ssl_antimony.pdf',
    substances: ['antimony'],
    directive: '9285.7-61',
    date: '2005-02',
  },
  {
    key: 'arsenic',
    file: 'eco-ssl_arsenic.pdf',
    substances: ['arsenic'],
    directive: '9285.7-62',
    date: '2005-03',
  },
  {
    key: 'barium',
    file: 'eco-ssl_barium.pdf',
    substances: ['barium'],
    directive: '9285.7-63',
    date: '2005-02',
  },
  {
    key: 'beryllium',
    file: 'eco-ssl_beryllium.pdf',
    substances: ['beryllium'],
    directive: '9285.7-64',
    date: '2005-02',
  },
  {
    key: 'cadmium',
    file: 'eco-ssl_cadmium.pdf',
    substances: ['cadmium'],
    directive: '9285.7-65',
    date: '2005-03',
  },
  {
    key: 'chromium',
    file: 'eco-ssl_chromium.pdf',
    substances: ['chromium-iii', 'chromium-vi'],
    directive: '9285.7-66',
    date: '2005-03',
    revised: '2008-04',
  },
  {
    key: 'cobalt',
    file: 'eco-ssl_cobalt_.pdf',
    substances: ['cobalt'],
    directive: '9285.7-67',
    date: '2005-03',
  },
  {
    key: 'copper',
    file: 'eco-ssl_copper.pdf',
    substances: ['copper'],
    directive: '9285.7-68',
    date: '2006-07',
    revised: '2007-02',
  },
  {
    key: 'ddt',
    file: 'eco-ssl_ddt.pdf',
    substances: ['ddt'],
    directive: '9285.7-57',
    date: '2007-04',
  },
  {
    key: 'dieldrin',
    file: 'eco-ssl_dieldrin.pdf',
    substances: ['dieldrin'],
    directive: '9285.7-56',
    date: '2005-03',
    revised: '2007-04',
  },
  {
    key: 'iron',
    file: 'eco-ssl_iron.pdf',
    substances: ['iron'],
    directive: '9285.7-69',
    date: '2003-11',
  },
  {
    key: 'lead',
    file: 'eco-ssl_lead.pdf',
    substances: ['lead'],
    directive: '9285.7-70',
    date: '2005-03',
  },
  {
    key: 'manganese',
    file: 'eco-ssl_manganese.pdf',
    substances: ['manganese'],
    directive: '9285.7-71',
    date: '2007-04',
  },
  {
    key: 'nickel',
    file: 'eco-ssl_nickel.pdf',
    substances: ['nickel'],
    directive: '9285.7-76',
    date: '2007-03',
  },
  {
    key: 'pah',
    file: 'eco-ssl_pah.pdf',
    substances: ['pah-lmw', 'pah-hmw'],
    directive: '9285.7-78',
    date: '2007-06',
  },
  {
    key: 'pcp',
    file: 'eco-ssl_pcp.pdf',
    substances: ['pcp'],
    directive: '9285.7-58',
    date: '2005-03',
    revised: '2007-04',
  },
  {
    key: 'selenium',
    file: 'eco-ssl_selenium.pdf',
    substances: ['selenium'],
    directive: '9285.7-72',
    date: '2007-07',
  },
  {
    key: 'silver',
    file: 'eco-ssl_silver.pdf',
    substances: ['silver'],
    directive: '9285.7-77',
    date: '2006-09',
  },
  {
    key: 'vanadium',
    file: 'eco-ssl_vanadium.pdf',
    substances: ['vanadium'],
    directive: '9285.7-75',
    date: '2005-04',
  },
  {
    key: 'zinc',
    file: 'eco-ssl_zinc.pdf',
    substances: ['zinc'],
    directive: '9285.7-73',
    date: '2007-06',
  },
];
