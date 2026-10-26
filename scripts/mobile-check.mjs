// Mobile layout check: drives an installed Chrome through CDP device emulation (no dependencies).
// Usage: corepack pnpm mobile:check [--modeled] [--routes <list>] [--views <list>] [--url <url>]
//        [--chrome <path>] [--out <dir>]
// Without --url it serves the built app with `vite preview` on a free port (build first). Chrome also gets
// a free debugging port and a fresh profile, so runs from parallel worktrees never share a server or a
// browser. Both are stopped on exit, on SIGINT and on SIGTERM.
// Visits every route at a true 390x844 viewport in light and dark, plus once at 1280x900, after
// pressing the compute buttons so result tables and charts are on screen, and counts elements whose
// right edge exceeds the document client width. Exits 1 if any count is above 0.
// The "modeled" visit (an in-browser modeled cleanup run, then the report's modeled block) is the heaviest
// visit, so it runs only with --modeled; `corepack pnpm mobile:check:full` passes it. While iterating on one
// screen, narrow the run with --routes and --views: one route in one view takes seconds.
// A view also fails when the app did not mount or the route is empty (a build made for another BASE_PATH
// and served at the root is blank): it needs the Main nav, exactly one main#main with an h1, and inside it
// a form control, table or chart plus a minimum of text (rule and thresholds: scripts/shell-verdict.mjs).
// It also injects axe-core (a dev dependency, never bundled) into each page and fails on any serious or
// critical violation; moderate and minor ones are counted and listed but do not fail the run.
// Pass --no-axe to skip the axe pass, and --axe-json <file> to write every violation to a JSON file.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { shellProblems } from './shell-verdict.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const AXE = !args.includes('--no-axe');
const axeSource = AXE
  ? readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  : '';
const axeReport = [];
const MODELED = args.includes('--modeled');
const startedAt = Date.now();
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chromePath = opt(
  'chrome',
  CHROME_CANDIDATES.find((p) => existsSync(p)),
);
if (!chromePath) throw new Error('No Chrome binary found; pass --chrome <path>');
const outDir = opt('out', join(process.cwd(), 'apps/web/.mobile-check'));
mkdirSync(outDir, { recursive: true });

// Layout-test inputs for the screens that are empty by default; each entry is a form value a user could type.
const SEED = {
  format: 'model_flow.project',
  version: 1,
  createdWith: '0.0.1',
  savedAt: '2026-10-18T12:00:00.000Z',
  title: 'Mobile check',
  screens: {
    vadose: { form: { foc: '0.0123' } },
    transport: { form: { c0: '7' }, method: 'modern' },
    surfaceWater: { form: { volume: '3' } },
    risk: { form: { routeExtrapolation: true } },
    cleanup: { form: { source: 'dissolved' } },
    vapor: { form: { source: 'groundwater' } },
    plantsEco: {
      form: {
        soilConcentration: '5',
        logKow: '2',
        koc: '100',
        foc: '0.01',
        bulkDensity: '1.5',
        waterFilledPorosity: '0.2',
        moistureFraction: '0.9',
        tphTotal: '1000',
        tphThetaA: '0.3',
        tphFractions: [
          {
            label: 'Aliphatic C5-C8',
            family: 'aliphatic',
            massFraction: '0.5',
            surrogate: 'E1790666',
            level: '500',
          },
          {
            label: 'Aromatic C9-C16',
            family: 'aromatic',
            massFraction: '0.5',
            surrogate: 'E1790674',
            level: '300',
          },
        ],
      },
    },
  },
};
// The guided visit's project: two chemicals (benzene and MTBE) with groundwater and soil gas sources, the
// well and building paths, a downgradient exposure point, the site properties and source values filled in.
// The step 3d Run is pressed in the browser (see GUIDED_RUN), so the outputs come from the real runner.
const GUIDED_IDS = ['71-43-2', '1634-04-4'];
const GUIDED_SEED = {
  ...SEED,
  version: 3,
  title: 'Mobile check, guided',
  chemicals: [
    { id: GUIDED_IDS[0], name: 'Benzene' },
    { id: GUIDED_IDS[1], name: 'Methyl tert-butyl ether' },
  ],
  guided: {
    site: {
      sources: ['groundwater', 'soilGas'],
      location: 'downgradient',
      paths: { well: true, building: true },
    },
    forms: {
      transport: {
        dispLaw: 'entered',
        alphaLOverride: '10',
        alphaTOverride: '1',
        alphaVOverride: '0.1',
      },
      household: {
        showerMethod: 'little',
        householdFactor: '0.0005',
        showerDropletDiameter: '1',
        showerFallTime: '1',
        showerFlow: '8',
        showerMinutes: '10',
        stallVolume: '2',
        ventilation: '1',
        postShowerMinutes: '5',
        filmGas: '3',
        filmLiquid: '0.02',
      },
      vapor: { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' },
    },
    sources: Object.fromEntries(
      GUIDED_IDS.map((id) => [
        id,
        {
          values: {
            groundwater: { value: '1', unit: 'mg/L' },
            soilGas: { value: '50', unit: 'ug/m3' },
          },
          note: 'mobile check',
          tph: '',
        },
      ]),
    ),
  },
};
// The five guided step screens that exist in wave AC1 (steps 4a to 6 are placeholders until wave AC2).
const GUIDED_ROUTES = [
  '#/step/chemicals',
  '#/step/site',
  '#/step/properties',
  '#/step/sources',
  '#/step/run',
];
// Press Run on step 3d and wait for "Up to date", then open every disclosure so the well tables are measured.
const GUIDED_RUN = `(async()=>{const u=window.__ui;
  const find=(re)=>[...document.querySelectorAll('main button')].find(x=>re.test(x.textContent.trim()));
  let run=null;
  for(let i=0;i<120&&!run;i++){const b=find(/^run all chemicals/i);if(b&&!b.disabled)run=b;else await u.sleep(250)}
  if(!run)return 'run button never enabled: '+[...document.querySelectorAll('main [role=alert],main .guided-run-status')].map(e=>e.textContent.trim()).join(' | ');
  run.click();
  for(let i=0;i<240;i++){
    if(/^up to date/i.test((document.querySelector('main .guided-run-status')||{}).textContent||''))break;
    await u.sleep(250)}
  await u.sleep(500);
  document.querySelectorAll('main details').forEach(d=>{d.open=true});
  await u.sleep(500);return null})()`;
const ROUTES = [
  '#/',
  ...GUIDED_ROUTES,
  '#/transport',
  '#/vadose',
  '#/saturated',
  '#/vapor',
  '#/surface-water',
  '#/household',
  '#/plants-eco',
  '#/site',
  '#/chemicals',
  '#/risk',
  '#/cleanup',
  '#/report',
  '#/methods',
  '#/validation',
  '#/docs',
  '#/docs/user-guide',
  '#/docs/uncertainty',
  '#/docs/vapor-models',
  '#/docs/attributions',
];
// Screens that read an in-memory feed (never saved with the project) are visited a second time as
// "fed" routes: the sending screen is opened and its send buttons pressed, then the hash changes to the
// receiving screen without a reload, so the held feed is on screen (the cleanup produce switch and the
// total TPH level panel).
const FED_ROUTES = [
  {
    route: '#/cleanup',
    via: '#/plants-eco',
    // lead (an inorganic, so no organic partitioning inputs), its produce factors sent to the cleanup screen
    viaSetup: `(async()=>{const u=window.__ui;
      // the project list holds lead (added on #/chemicals), then plants and eco picks it from the list
      location.hash='#/chemicals';await u.sleep(1500);await u.pick('lead',/^add to project: lead and compounds/i);await u.sleep(800);
      location.hash='#/plants-eco';await u.sleep(1500);u.choose(/^chemical/i,/^lead and compounds/i);await u.sleep(800);
      u.fill(/^log kow/i,'3');u.fill(/^kd \\(l\\/kg\\)/i,'5');u.fill(/^moisture fraction/i,'0.8');u.fill(/^dry bulk density/i,'1.5');
      await u.sleep(500)})()`,
    routeSetup: `(async()=>{const u=window.__ui;await u.sleep(800);
      u.tick(/homegrown produce/i);await u.sleep(500)})()`,
  },
  // "seeded" routes: no feed, the screen is opened and driven in place so a panel that only exists once a
  // chemical is chosen is on screen. #/risk with benzene, its Edit values disclosure and the receptor
  // exposure factor panel open, with an edit typed in each (the edited marks and reset buttons show).
  {
    route: '#/risk',
    tag: 'seeded',
    viaSetup: `(async()=>{const u=window.__ui;await u.pick('71-43-2',/^add benzene/i);await u.sleep(800);
      u.fill(/^receptor name/i,'North lot worker');
      u.fill(/^your value for oral slope factor/i,'0.5');u.fill(/^source note \\(required\\)/i,'site toxicologist memo');
      u.fill(/^body weight \\(kg\\)/i,'60');u.fill(/^source note for body weight/i,'site survey');
      await u.sleep(300);
      document.querySelectorAll('main details.override-panel').forEach(d=>{d.open=true});
      await u.sleep(500)})()`,
  },
  // "solubility" route: #/cleanup with toluene and xylenes added and a very low solubility ceiling typed, so
  // the per-chemical solubility list, the ceiling box and the flag on a groundwater level above the ceiling
  // (the "above the solubility" line in the cell and the note under the table) are on screen.
  {
    route: '#/cleanup',
    tag: 'solubility',
    noPress: true,
    viaSetup: `(async()=>{const u=window.__ui;await u.sleep(1000);
      await u.pick('108-88-3',/^add toluene/i);await u.sleep(600);
      await u.pick('1330-20-7',/^add xylenes/i);await u.sleep(600);
      u.tick(/medium contacted/i);await u.sleep(500);
      u.fill(/^solubility ceiling/i,'0.0000001');await u.sleep(800)})()`,
  },
  // "criteria" route: #/surface-water with the comparison panel open on the union of all criteria sets and zinc
  // compared, so the set selector, the basis and source lines under each criterion and the wide result tables
  // are on screen (the panel is closed by default, and the other visits never reach it).
  {
    route: '#/surface-water',
    tag: 'criteria',
    viaSetup: `(async()=>{const u=window.__ui;await u.sleep(1500);
      const open=[...document.querySelectorAll('main button')].find(x=>/^compare with water quality criteria/i.test(x.textContent.trim()));
      if(open)open.click();
      await u.sleep(800);
      u.choose(/^criteria set/i,/^all of the sets/i);
      await u.sleep(1500);
      await u.pick('7440-66-6',/^compare zinc/i);
      await u.sleep(1200)})()`,
  },
  // "projectlist" route: #/chemicals with a database chemical added and a user chemical with a long name
  // defined, so the project list rows (name, id, "defined by you", Edit and Remove), the chemical editor
  // and the remove confirmation are all on screen at once.
  {
    route: '#/chemicals',
    tag: 'projectlist',
    noPress: true,
    viaSetup: `(async()=>{const u=window.__ui;await u.sleep(1000);
      const btn=(re)=>[...document.querySelectorAll('main button')].find(x=>re.test(x.textContent.trim())||re.test(x.getAttribute('aria-label')||''));
      // add each chemical only when the project list lacks it
      const listed=(re)=>[...document.querySelectorAll('main .project-chemicals .chem-list li')].some(l=>re.test(l.textContent));
      if(!listed(/benzene/i)){await u.pick('71-43-2',/^add to project: benzene/i);await u.sleep(600)}
      if(!listed(/Bis\\(2-ethylhexyl\\)phthalate \\(copy\\)/)){
        btn(/^define a new chemical/i).click();await u.sleep(500);
        u.fill(/^name/i,'Bis(2-ethylhexyl)phthalate (copy)');
        u.fill(/^molar mass value/i,'390.56');u.fill(/^molar mass source note/i,'supplier safety data sheet, 2026');
        await u.sleep(300);
        btn(/^save chemical/i).click();await u.sleep(600)}
      btn(/^edit bis/i).click();await u.sleep(500);
      btn(/^remove bis/i).click();await u.sleep(500)})()`,
  },
  // "modeled" route: the report's modeled-source uncertainty block, which only shows a result after an
  // in-browser modeled cleanup run. Benzene and toluene are added, the transport screen sends an aquifer
  // for each to the cleanup screen (two chemicals, so the per-chemical blocks show), the
  // cleanup screen (a dissolved source, the seed) runs "Probabilistic cleanup level, modeled source" at
  // its default 200 iterations, and the hash then changes to the report with "Include uncertainty
  // results" ticked. The kept result is session memory, so no step reloads the page.
  {
    route: '#/report',
    via: '#/transport',
    mid: '#/cleanup',
    tag: 'modeled',
    noPress: true,
    viaSetup: `(async()=>{const u=window.__ui;
      // two chemicals, so the cleanup screen solves and reports each on its own: both are added on the
      // chemicals page, then each gets its own groundwater run sent from the transport screen
      location.hash='#/chemicals';await u.sleep(1500);
      await u.pick('71-43-2',/^add to project: benzene/i);await u.sleep(800);
      await u.pick('108-88-3',/^add to project: toluene/i);await u.sleep(800);
      location.hash='#/transport';await u.sleep(1500);
      for(const name of [/benzene/i,/^toluene/i]){
        for(let i=0;i<40&&!u.choose(/^chemical/i,name);i++)await u.sleep(250);
        await u.sleep(800);
        for(let i=0;i<80;i++){
          const b=[...document.querySelectorAll('main button')].find(x=>/^use for cleanup levels/i.test(x.textContent.trim()));
          if(b&&!b.disabled){b.click();break}
          await u.sleep(250)}
        await u.sleep(500)}
      })()`,
    midSetup: `(async()=>{const u=window.__ui;await u.sleep(500);
      const find=(re)=>[...document.querySelectorAll('main button')].find(x=>re.test(x.textContent.trim()));
      const findRow=()=>[...document.querySelectorAll('main fieldset.dist-row')].find(f=>/seepage velocity/i.test(f.getAttribute('aria-label')||''));
      for(let i=0;i<240&&!findRow();i++)await u.sleep(250);
      const row=findRow();
      const ctl=(re)=>{const l=[...row.querySelectorAll('label')].find(x=>re.test(x.textContent.trim()));return l&&(l.control||l.querySelector('input,select'))};
      const sel=row&&ctl(/distribution/i);
      if(sel){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel,'uniform');sel.dispatchEvent(new Event('change',{bubbles:true}));await u.sleep(300);
        const lo=ctl(/minimum/i),hi=ctl(/maximum/i);
        const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
        if(lo)set(lo,'5');if(hi)set(hi,'40');await u.sleep(300)}
      let run=null;
      for(let i=0;i<200&&!run;i++){const b=find(/^run probabilistic cleanup/i);if(b&&!b.disabled)run=b;else await u.sleep(250)}
      if(!run)return 'run button never enabled: '+[...document.querySelectorAll('main button')].map(b=>b.textContent.trim()+(b.disabled?'(off)':'')).filter(t=>/run|use/i.test(t)).join(' | ')+' panel='+!!document.querySelector('[aria-label="Probabilistic cleanup level, modeled source"]')+' panel='+document.querySelector('[aria-label="Probabilistic cleanup level, modeled source"]').textContent.replace(/Sample the inputs.*?never sampled because it is the level being solved./,'').slice(0,700);
      // both chemicals are solved on their own: each has a heading in the results
      for(let i=0;i<240;i++){const hs=[...document.querySelectorAll('main h2,main h3,main h4')].map(h=>h.textContent);if(hs.some(t=>/benzene/i.test(t))&&hs.some(t=>/toluene/i.test(t)))break;await u.sleep(250)}
      {const hs=[...document.querySelectorAll('main h2,main h3,main h4')].map(h=>h.textContent);
       if(!(hs.some(t=>/benzene/i.test(t))&&hs.some(t=>/toluene/i.test(t))))return 'per-chemical headings missing: '+hs.join(' | ')}
      run.click();
      for(let i=0;i<240;i++){
        const done=!!document.querySelector('[aria-label="Probabilistic cleanup level, modeled source"] [role=table],[aria-label="Probabilistic cleanup level, modeled source"] table')
          &&!document.querySelector('[aria-label="Run progress"]');
        if(done)break;
        await u.sleep(250)}
      await u.sleep(500);return null})()`,
    routeSetup: `(async()=>{const u=window.__ui;await u.sleep(1000);
      u.tick(/include uncertainty results/i);
      for(let i=0;i<120;i++){
        if(document.querySelector('[aria-label^="Modeled source uncertainty results"]'))break;
        await u.sleep(250)}
      await u.sleep(1000)})()`,
  },
];
// "guided" routes: each step screen over GUIDED_SEED, not pressed (PRESS would run the models twice); step 3d
// presses its own Run first.
FED_ROUTES.push(
  ...GUIDED_ROUTES.map((route) => ({
    route,
    tag: 'guided',
    seed: GUIDED_SEED,
    noPress: true,
    ...(route === '#/step/run' ? { viaSetup: GUIDED_RUN } : {}),
  })),
);
// --routes '#/docs,#/risk' limits the run to those routes (a prefix match), for a quick pass on one screen.
const ONLY = opt('routes');
// --views m390-light,d1280-light limits the run to those viewports.
const ONLY_VIEWS = opt('views');
const VIEWS = [
  { name: 'm390-light', w: 390, h: 844, mobile: true, dark: false },
  { name: 'm390-dark', w: 390, h: 844, mobile: true, dark: true },
  { name: 'd1280-light', w: 1280, h: 900, mobile: false, dark: false },
].filter((v) => !ONLY_VIEWS || ONLY_VIEWS.split(',').includes(v.name));
if (!VIEWS.length) throw new Error(`--views matched nothing: ${ONLY_VIEWS}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
// Each child leads its own process group, so stopping the group also stops the node and vite processes that
// `corepack pnpm` starts under it (killing the wrapper alone left `vite preview` holding its port).
const stopGroup = (child) => {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
let server;
let baseUrl = opt('url');
if (!baseUrl) {
  if (!existsSync(join(process.cwd(), 'apps/web/dist/index.html')))
    throw new Error('No built app in apps/web/dist; run corepack pnpm build first, or pass --url');
  const port = await freePort();
  server = spawn(
    'corepack',
    ['pnpm', '--filter', '@model-flow/web', 'preview', '--port', String(port), '--strictPort'],
    { stdio: 'ignore', detached: true },
  );
  baseUrl = `http://localhost:${port}/`;
}
const profileDir = mkdtempSync(join(tmpdir(), 'mobile-check-'));
// Port 0 lets Chrome pick a free debugging port; it writes the port to DevToolsActivePort in the profile.
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  stopGroup(chrome);
  stopGroup(server);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
};
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });

async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* retry */
    }
    if (Date.now() > end) throw new Error('timeout waiting for ' + fn);
    await sleep(300);
  }
}
await until(async () => (await fetch(baseUrl)).ok);
const debugPort = await until(
  () => Number(readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null,
);
const tabs = await until(async () => {
  const pages = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).filter(
    (t) => t.type === 'page',
  );
  return pages.length ? pages : null;
});
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
// a setup script that throws comes back as its error message, so the visit reports it instead of an object
const evaluateAsync = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails)
    return `setup threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`;
  return r.result?.value;
};

const PRESS = `(async()=>{
  // the seed names the TPH fractions; the buttons that would reset them or append a blank row are left alone
  const re=/^(?!start from the five|add a fraction)(calculate|compute|run|solve|evaluate|send to|load an example|start from|add a|apply)/i;
  for(let pass=0;pass<5;pass++){
    for(const b of document.querySelectorAll('main button')){
      if(!b.disabled&&re.test(b.textContent.trim())) b.click();
    }
    await new Promise(r=>setTimeout(r,700));
  }
})()`;

// Drivers for the fed routes: type into a labelled input the way a user would (React sees the input event),
// pick a chemical from the search results, and tick a checkbox by its label.
const UI = `(()=>{
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const setValue=(el,v)=>{
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const labelled=(re)=>[...document.querySelectorAll('main label')].find(l=>re.test(l.textContent.trim()));
  window.__ui={
    sleep,
    async pick(query,name){
      const search=document.querySelector('main input[type=search],main input[aria-label*="chemical" i],main input');
      const input=[...document.querySelectorAll('main input')].find(i=>/find a chemical/i.test(i.labels?.[0]?.textContent||i.getAttribute('aria-label')||''))||search;
      setValue(input,query);
      for(let i=0;i<40;i++){
        const b=[...document.querySelectorAll('main button')].find(x=>(name.test(x.textContent.trim())||name.test(x.getAttribute('aria-label')||'')));
        if(b){b.click();return true}
        await sleep(250);
      }
      return false;
    },
    // choose an option of a labelled select by its visible text, the way a user picks from the project list
    choose(labelRe,optionRe){
      const l=labelled(labelRe);const sel=l&&(l.control||l.querySelector('select'));
      const o=sel&&[...sel.options].find(x=>optionRe.test(x.textContent.trim()));
      if(!o)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      set.call(sel,o.value);sel.dispatchEvent(new Event('change',{bubbles:true}));return true;
    },
    fill(re,v){const l=labelled(re);const i=l&&(l.control||l.querySelector('input'));if(i)setValue(i,v);return !!i},
    tick(re){const l=labelled(re);const i=l&&(l.control||l.querySelector('input'));if(i&&!i.checked)i.click();return !!i},
  };
})()`;
const READY = `(()=>{const main=document.querySelector('main#main');
  if(!main||!main.querySelector('h1'))return false;
  return ![...main.querySelectorAll('p.muted')].some((p)=>/^Loading\\b/.test((p.textContent||'').trim()))})()`;
const MEASURE = `(()=>{const cw=document.documentElement.clientWidth;
  const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>cw+0.5});
  return JSON.stringify({cw,sw:document.documentElement.scrollWidth,n:bad.length,
    bad:bad.slice(0,6).map(e=>e.tagName.toLowerCase()+(e.className&&e.className.baseVal===undefined?'.'+String(e.className).trim().split(/\\s+/).join('.'):'')),
    seedOpen:document.querySelectorAll('main details.override-panel[open]').length,seedEdited:document.querySelectorAll('main .override-row.edited .edited-mark').length,projectList:{rows:document.querySelectorAll('main .project-chemicals .chem-list li').length,user:[...document.querySelectorAll('main .project-chemicals .chem-list li')].some(l=>/defined by you/.test(l.textContent)&&/Bis\\(2-ethylhexyl\\)phthalate \\(copy\\)/.test(l.textContent)),editor:!!document.querySelector('main .user-chemical-editor'),confirm:!!document.querySelector('main [role=group][aria-label^="Remove Bis"]')},seedBenzene:!![...document.querySelectorAll('main')].some(m=>/benzene/i.test(m.textContent)),modeledBlock:(()=>{const e=document.querySelector('[aria-label^="Modeled source uncertainty results"]');const t=e?e.textContent:'';return {present:!!e,current:/iterations ran/.test(t)&&/Which inputs matter/.test(t),notRun:/No run yet/.test(t),stale:/out of date/.test(t)}})(),solubility:{list:document.querySelectorAll('main ul.solubility-defaults li').length,flags:document.querySelectorAll('main .level-flag').length,notes:[...document.querySelectorAll('main p.alert[role=note]')].filter(p=>/above the solubility/.test(p.textContent)).length},fedPanel:!!document.querySelector('[aria-label="Total TPH level"]'),fedProduce:[...document.querySelectorAll('main label')].some(l=>/plant factors for homegrown produce/i.test(l.textContent)&&!!l.querySelector('input:checked')),critTables:document.querySelectorAll('main .criteria table.crit').length,critRows:document.querySelectorAll('main .criteria table.crit tbody tr').length,critSet:((document.querySelector('main .criteria select')||{}).value)||'',critNotes:document.querySelectorAll('main .criteria details.crit-note').length,guidedRun:{charts:document.querySelectorAll('main [role=img][aria-label*="at the well"]').length,tables:document.querySelectorAll('main table[aria-label$="at the well, values"]').length,upToDate:/^up to date/i.test((document.querySelector('main .guided-run-status')||{}).textContent||''),status:((document.querySelector('main .guided-run-status')||{}).textContent||'').slice(0,160)},tables:document.querySelectorAll('main table').length,charts:document.querySelectorAll('main svg').length,
    navMain:document.querySelectorAll('nav[aria-label="Main"]').length,mains:document.querySelectorAll('main#main').length,mainH1:document.querySelectorAll('main#main h1').length,controls:document.querySelectorAll('main#main input,main#main select,main#main textarea').length,links:document.querySelectorAll('main#main a[href]').length,textLen:((document.querySelector('main#main')||{}).innerText||'').trim().length,
    small:[...document.querySelectorAll('main button,main a,main input,main select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<44)}).length})})()`;

const AXE_RUN = `(async()=>{
  const r=await axe.run(document,{resultTypes:['violations']});
  return JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,
    nodes:v.nodes.slice(0,5).map(n=>n.target.join(' ')),count:v.nodes.length})))})()`;
const runAxe = async () => {
  await evaluate(axeSource);
  const res = await send('Runtime.evaluate', {
    expression: AXE_RUN,
    returnByValue: true,
    awaitPromise: true,
  });
  return JSON.parse(res.result?.value ?? '[]');
};

const visits = [...ROUTES.map((route) => ({ route, via: null })), ...FED_ROUTES].filter(
  (v) =>
    (MODELED || v.tag !== 'modeled') &&
    (!ONLY || ONLY.split(',').some((o) => v.route === o || v.route.startsWith(`${o}/`))),
);
console.log(
  `${visits.length} visits x ${VIEWS.length} views (${VIEWS.map((v) => v.name).join(', ')})` +
    (MODELED ? ', modeled visit included' : ', modeled visit skipped (pass --modeled)'),
);

let failures = 0;
for (const view of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: view.w,
    height: view.h,
    deviceScaleFactor: view.mobile ? 2 : 1,
    mobile: view.mobile,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: view.dark ? 'dark' : 'light' }],
  });
  for (const { route, via, mid, viaSetup, midSetup, routeSetup, tag, noPress, seed } of visits) {
    await send('Page.navigate', { url: baseUrl });
    await sleep(500);
    await evaluate(
      // every visit starts from the seed: it goes under the key the app reads first (the older keys are read
      // only when that one is missing, so a seed there would leave the previous visit's project in place)
      `try{localStorage.removeItem('model_flow.project.autosave.v1');localStorage.removeItem('model_flow.project.autosave.v2');localStorage.setItem('model_flow.project.autosave.v3',${JSON.stringify(JSON.stringify(seed ?? SEED))})}catch(e){};location.hash=${JSON.stringify(via ?? route)};location.reload()`,
    );
    await sleep(1800);
    if (viaSetup) {
      await evaluate(UI);
      await evaluateAsync(viaSetup);
    }
    if (!noPress) await evaluate(PRESS);
    if (mid) {
      // an intermediate screen, reached by hash change so the held feed and session results survive
      await evaluate(`location.hash=${JSON.stringify(mid)}`);
      await sleep(1500);
      await evaluate(UI);
      const note = await evaluateAsync(midSetup);
      if (note) console.log(`    mid: ${note}`);
    }
    if (via) {
      await evaluate(`location.hash=${JSON.stringify(route)}`);
      await sleep(1500);
      if (routeSetup) {
        await evaluate(UI);
        await evaluateAsync(routeSetup);
      }
      if (!noPress) await evaluate(PRESS);
    }
    await sleep(800);
    // Routes are lazy chunks behind a Suspense fallback and the documents load a second time, so wait (bounded)
    // for an h1 in main and no "Loading ..." fallback before measuring. A view that never gets there is measured
    // as it stands and fails with the shell reason.
    for (let waited = 0; waited < 10000; waited += 250) {
      if ((await evaluate(READY)) === true) break;
      await sleep(250);
    }
    const m = JSON.parse(await evaluate(MEASURE));
    const slug =
      (route.replace(/[#/]/g, '') || 'home') + (via ? '-fed' : '') + (tag ? `-${tag}` : '');
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      // the long committed documents are measured in full but only their first screen is captured
      captureBeyondViewport: !/^#\/docs\/(?!user-guide)/.test(route),
    });
    // a refused capture (an error in place of the image) fails the view rather than the whole run
    const shotFailed = typeof shot?.data !== 'string';
    if (shotFailed) console.log(`    screenshot failed: ${JSON.stringify(shot).slice(0, 300)}`);
    else writeFileSync(join(outDir, `${view.name}-${slug}.png`), Buffer.from(shot.data, 'base64'));
    let axeBad = false;
    let axeNote = '';
    if (AXE) {
      const v = await runAxe();
      const hard = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      axeBad = hard.length > 0;
      axeReport.push({
        view: view.name,
        route: tag ? `${route} (${tag})` : via ? `${route} (fed)` : route,
        violations: v,
      });
      axeNote = ` axe=${hard.length}+${v.length - hard.length}`;
      for (const x of v)
        axeNote += `\n    [${x.impact}] ${x.id} (${x.count}): ${x.nodes.slice(0, 3).join(' | ')}`;
    }
    const shell = shellProblems(m);
    const bad =
      shotFailed ||
      shell.length > 0 ||
      m.n > 0 ||
      m.sw > m.cw ||
      axeBad ||
      (via && !tag && !(m.fedPanel && m.fedProduce)) ||
      (tag === 'modeled' && !m.modeledBlock.current) ||
      (tag === 'projectlist' &&
        !(
          m.projectList.rows >= 2 &&
          m.projectList.user &&
          m.projectList.editor &&
          m.projectList.confirm
        )) ||
      (tag === 'seeded' && !(m.seedBenzene && m.seedOpen >= 2 && m.seedEdited >= 2)) ||
      (tag === 'solubility' &&
        !(m.solubility.list >= 2 && m.solubility.flags >= 1 && m.solubility.notes >= 1)) ||
      (tag === 'guided' &&
        route === '#/step/run' &&
        !(m.guidedRun.upToDate && m.guidedRun.charts >= 2 && m.guidedRun.tables >= 2)) ||
      (tag === 'criteria' && !(m.critSet === 'all' && m.critTables >= 2 && m.critRows >= 10));
    if (bad) failures++;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${view.name} ${route}${tag ? ` (${tag})` : via ? ` (fed from ${via})` : ''} cw=${m.cw} sw=${m.sw} overflow=${m.n}${tag === 'modeled' ? ` modeledBlock=${JSON.stringify(m.modeledBlock)}` : via && !tag ? ` tphPanel=${m.fedPanel} produceSwitch=${m.fedProduce}` : ''}${tag === 'projectlist' ? ` projectList=${JSON.stringify(m.projectList)}` : ''}${tag === 'solubility' ? ` solubility=${JSON.stringify(m.solubility)}` : ''}${tag === 'seeded' ? ` openPanels=${m.seedOpen} editedMarks=${m.seedEdited} benzene=${m.seedBenzene}` : ''}${tag === 'guided' && route === '#/step/run' ? ` guidedRun=${JSON.stringify(m.guidedRun)}` : ''}${tag === 'criteria' ? ` set=${m.critSet} criteriaTables=${m.critTables} criteriaRows=${m.critRows} notes=${m.critNotes}` : ''} tables=${m.tables} charts=${m.charts} nav=${m.navMain} main=${m.mains} h1=${m.mainH1} controls=${m.controls} links=${m.links} text=${m.textLen}${shell.length ? ` SHELL: ${shell.join('; ')}` : ''}${m.n ? ' ' + m.bad.join(' ') : ''}${axeNote}`,
    );
  }
}
if (opt('axe-json')) writeFileSync(opt('axe-json'), JSON.stringify(axeReport, null, 1));
console.log(`${failures} failing, done in ${Math.round((Date.now() - startedAt) / 1000)} s`);
cleanup();
process.exit(failures ? 1 : 0);
