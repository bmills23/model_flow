// Manual use only. Never run by the gate or CI.
//
//   tsx scripts/fetch-visl.ts [--scenario Resident|Commercial] [--tgw <deg C>] [--hq <number>]
//                             [--tr <number>] [--name <fixture name>]
//
// Queries the public EPA VISL calculator (a plain HTTP form post, no browser) for five chemicals and
// writes the page's own tables to a dated fixture under raw/visl/. With no options the settings are
// the form's defaults (resident, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6) and the
// fixture is named visl-default-resident-<date>.json. Options change one setting each: --scenario is
// the form's radio value (Resident or Commercial), --hq and --tr are the form's radio values (hq 0.1 or 1,
// tr 1e-06, 1e-05 or 0.0001), --tgw is the groundwater temperature. --name sets the fixture name
// (visl-<name>-<date>.json). The fixture keeps the query parameters, the input table, the VISL table and the
// chemical-property table exactly as the page prints them (cells as text, plus the parsed number
// where a cell is a number), the page's output timestamp and the "what's new" text the calculator
// publishes about its data edition. It refuses to overwrite an existing fixture.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const form = 'https://epa-visl.ornl.gov/cgi-bin/visl_search';
const whatsNew = 'https://www.epa.gov/vaporintrusion/visl-whats-new';
const chemicals = [
  ['71-43-2', 'Benzene'],
  ['79-01-6', 'Trichloroethylene'],
  ['127-18-4', 'Tetrachloroethylene'],
  ['91-20-3', 'Naphthalene'],
  ['100-41-4', 'Ethylbenzene'],
] as const;

const decode = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const strip = (html: string): string =>
  decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

const tableById = (html: string, id: string): string[][] => {
  const m = new RegExp(`<table[^>]*id="${id}"[^>]*>([\\s\\S]*?)</table>`).exec(html);
  if (!m) throw new Error(`table ${id} not found`);
  return [...m[1]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => strip(c[1]!)),
  );
};

const options: Record<string, string> = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i]?.replace(/^--/, '');
  const value = argv[i + 1];
  if (!key || !['scenario', 'tgw', 'hq', 'tr', 'name'].includes(key) || value === undefined) {
    console.error('usage: fetch-visl.ts [--scenario S] [--tgw T] [--hq Q] [--tr R] [--name N]');
    process.exit(1);
  }
  options[key] = value;
}
const scenario = options.scenario ?? 'Resident';
if (!['Resident', 'Commercial'].includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
const defaults = { hq: '0.1', tr: '1e-06', tgw: '25' };
const changed = (['hq', 'tr', 'tgw'] as const).filter(
  (k) => options[k] !== undefined && options[k] !== defaults[k],
);
const settingsNote =
  scenario === 'Resident' && changed.length === 0
    ? 'fields below are the form defaults'
    : `fields below are the form defaults except: ${[
        ...(scenario === 'Resident' ? [] : [`scenario ${scenario}`]),
        ...changed.map((k) => `${k} ${options[k]}`),
      ].join(', ')}`;

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().slice(0, 10);
const outDir = join(pkg, 'raw/visl');
const outFile = join(
  outDir,
  `visl-${options.name ?? `default-${scenario.toLowerCase()}`}-${stamp}.json`,
);
if (existsSync(outFile)) {
  console.error(`${outFile} already exists`);
  process.exit(1);
}

const formHtml = await (await fetch(form)).text();
const optionFor = (cas: string): string => {
  const m = new RegExp(`<option value="([0-9-]+-SWFA)">[^<]*\\(${cas}\\)`).exec(formHtml);
  if (!m) throw new Error(`no calculator option for ${cas}`);
  return m[1]!;
};

const query = {
  _submitted_form: '1',
  tool: 'visl',
  action: 'next',
  extraflag: 'false',
  select: 'chem',
  lastRec: 'false',
  hq: options.hq ?? defaults.hq,
  tr: options.tr ?? defaults.tr,
  scenario,
  risk: 'no',
  valtype: 'default',
  inputs: 'db',
  tgw: options.tgw ?? defaults.tgw,
  rfd: 'chronic',
  _submit: 'Retrieve',
};

const parsed = (s: string): number | undefined => {
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : undefined;
};

const results = [];
let inputs: string[][] = [];
let generated = '';
for (const [cas, name] of chemicals) {
  const analysis = optionFor(cas);
  const body = new URLSearchParams({ ...query, analysis });
  const res = await fetch(form, { method: 'POST', body });
  if (!res.ok) throw new Error(`VISL query for ${cas} failed: ${res.status}`);
  const html = await res.text();
  const rows = tableById(html, 'visl');
  const header = rows[0]!;
  const data = rows[1];
  if (!data || data.length !== header.length || data[1] !== cas)
    throw new Error(`unexpected VISL table for ${cas}`);
  const props = tableById(html, 'vislparams');
  inputs = tableById(html, 'vislinputs').slice(1);
  generated = /Output generated\s+([0-9A-Za-z:]+)/.exec(html)?.[1] ?? generated;
  results.push({
    cas,
    name,
    analysis,
    visl: header.map((h, i) => ({ column: h, cell: data[i]!, value: parsed(data[i]!.trim()) })),
    properties: props[0]!.map((h, i) => ({
      column: h,
      cell: props[1]![i]!,
      value: parsed(props[1]![i]!.trim()),
    })),
  });
}

const newsHtml = await (await fetch(whatsNew)).text();
const news = decode(
  newsHtml
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' '),
)
  .replace(/\s+/g, ' ')
  .trim();
// The newest entry is the first dated entry after the introduction.
const newest = /([A-Z][a-z]+ \d{1,2}, \d{4}) (The toxicity values[^.]*\.)/.exec(news);
if (!newest) throw new Error("the calculator's what-is-new page has no dated entry");
const fixture = {
  retrieved: stamp,
  source: form,
  method: `HTTP POST of the calculator form, no browser; ${settingsNote}`,
  query: { ...query, analysis: 'one option per chemical, see results[].analysis' },
  pageOutputGenerated: generated,
  versionText: {
    page: whatsNew,
    newestEntry: `${newest[1]} ${newest[2]}`,
    note: 'The result page prints no version number; the calculator publishes its data edition in its what is new page.',
  },
  inputs: inputs.map(([variable, value]) => ({ variable, value })),
  results,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${outFile}`);
