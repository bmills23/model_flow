/**
 * Substance to chemicals.json (RSL November 2024) record ids. The ids and names were read from
 * packages/data/generated/rsl-2024-11/chemicals.json; the build checks every id exists and its name
 * matches. A substance with no entry is reported as unmapped in ecossl.json, never dropped.
 */
export interface SubstanceMapping {
  name: string;
  chemicalIds: string[];
  /** Each mapped record's name must match. */
  nameMatch: RegExp;
  note?: string;
}

export const MAPPING: Record<string, SubstanceMapping> = {
  aluminum: { name: 'Aluminum', chemicalIds: ['7429-90-5'], nameMatch: /^Aluminum$/ },
  antimony: { name: 'Antimony', chemicalIds: ['7440-36-0'], nameMatch: /^Antimony \(metallic\)$/ },
  arsenic: { name: 'Arsenic', chemicalIds: ['7440-38-2'], nameMatch: /^Arsenic, Inorganic$/ },
  barium: { name: 'Barium', chemicalIds: ['7440-39-3'], nameMatch: /^Barium$/ },
  beryllium: {
    name: 'Beryllium',
    chemicalIds: ['7440-41-7'],
    nameMatch: /^Beryllium and compounds$/,
  },
  cadmium: {
    name: 'Cadmium',
    chemicalIds: ['7440-43-9-cadmium-diet', '7440-43-9-cadmium-water'],
    nameMatch: /^Cadmium \((Diet|Water)\)$/,
    note: 'The RSL set carries two cadmium records (diet and water exposure); the soil Eco-SSL is for the element.',
  },
  'chromium-iii': {
    name: 'Chromium (III)',
    chemicalIds: [
      '16065-83-1-chromium-iii-soluble-compounds',
      '16065-83-1-chromium-iii-insoluble-salts',
    ],
    nameMatch: /^Chromium\(III\)/,
  },
  'chromium-vi': {
    name: 'Chromium (VI)',
    chemicalIds: ['18540-29-9'],
    nameMatch: /^Chromium\(VI\)$/,
  },
  cobalt: { name: 'Cobalt', chemicalIds: ['7440-48-4'], nameMatch: /^Cobalt$/ },
  copper: { name: 'Copper', chemicalIds: ['7440-50-8'], nameMatch: /^Copper$/ },
  ddt: {
    name: 'DDT and metabolites',
    chemicalIds: ['50-29-3', '72-55-9', '72-54-8'],
    nameMatch:
      /^Dichlorodiphenyl(trichloroethane|dichloroethylene|dichloroethane), p,p'- \((DDT|DDE|DDD)\)$/,
    note: 'The document names DDT with its breakdown products DDE and DDD.',
  },
  dieldrin: { name: 'Dieldrin', chemicalIds: ['60-57-1'], nameMatch: /^Dieldrin$/ },
  iron: { name: 'Iron', chemicalIds: ['7439-89-6'], nameMatch: /^Iron$/ },
  lead: {
    name: 'Lead',
    chemicalIds: [
      '7439-92-1-lead-and-compounds',
      '7439-92-1-lead-and-compounds-with-other-sources-of-lead-present-see-guidance',
    ],
    nameMatch: /^Lead and Compounds/,
  },
  manganese: {
    name: 'Manganese',
    chemicalIds: ['7439-96-5-manganese-diet', '7439-96-5-manganese-non-diet'],
    nameMatch: /^Manganese \((Diet|Non-diet)\)$/,
  },
  nickel: {
    name: 'Nickel',
    chemicalIds: ['7440-02-0'],
    nameMatch: /^Nickel Soluble Salts$/,
    note: 'The RSL record for the element is titled Nickel Soluble Salts; the soil Eco-SSL is for nickel.',
  },
  pcp: { name: 'Pentachlorophenol', chemicalIds: ['87-86-5'], nameMatch: /^Pentachlorophenol$/ },
  selenium: { name: 'Selenium', chemicalIds: ['7782-49-2'], nameMatch: /^Selenium$/ },
  silver: { name: 'Silver', chemicalIds: ['7440-22-4'], nameMatch: /^Silver$/ },
  vanadium: { name: 'Vanadium', chemicalIds: ['7440-62-2'], nameMatch: /^Vanadium and Compounds$/ },
  zinc: { name: 'Zinc', chemicalIds: ['7440-66-6'], nameMatch: /^Zinc and Compounds$/ },
};

export const UNMAPPED: Record<string, { name: string; reason: string }> = {
  'pah-lmw': {
    name: 'Low molecular weight PAHs',
    reason:
      'The document defines the group by ring count (fewer than four rings) and lists no member compounds; membership is a chemistry mapping left to the ecological screening slice.',
  },
  'pah-hmw': {
    name: 'High molecular weight PAHs',
    reason:
      'The document defines the group by ring count (four or more rings) and lists no member compounds; membership is a chemistry mapping left to the ecological screening slice.',
  },
};
