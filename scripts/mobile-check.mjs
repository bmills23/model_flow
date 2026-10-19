// Mobile layout check: drives an installed Chrome through CDP device emulation (no dependencies).
// Usage: corepack pnpm mobile:check [--url http://localhost:5178/] [--chrome <path>] [--out <dir>]
// Without --url it serves the built app with `vite preview` on port 5178 (build first).
// Visits every route at a true 390x844 viewport in light and dark, plus once at 1280x900, after
// pressing the compute buttons so result tables and charts are on screen, and counts elements whose
// right edge exceeds the document client width. Exits 1 if any count is above 0.
// It also injects axe-core (a dev dependency, never bundled) into each page and fails on any serious or
// critical violation; moderate and minor ones are counted and listed but do not fail the run.
// Pass --no-axe to skip the axe pass, and --axe-json <file> to write every violation to a JSON file.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
const PORT = 5178;
const DEBUG_PORT = 9335;
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
const ROUTES = [
  '#/',
  '#/transport',
  '#/vadose',
  '#/saturated',
  '#/vapor',
  '#/surface-water',
  '#/household',
  '#/plants-eco',
  '#/chemicals',
  '#/risk',
  '#/cleanup',
  '#/report',
  '#/methods',
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
    viaSetup: `(async()=>{const u=window.__ui;await u.pick('lead',/^add lead and compounds/i);await u.sleep(800);
      u.fill(/^log kow/i,'3');u.fill(/^kd \\(l\\/kg\\)/i,'5');u.fill(/^moisture fraction/i,'0.8');u.fill(/^dry bulk density/i,'1.5');
      await u.sleep(500)})()`,
    routeSetup: `(async()=>{const u=window.__ui;await u.pick('lead',/^add lead and compounds/i);await u.sleep(800);
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
      u.fill(/^your value for oral slope factor/i,'0.5');u.fill(/^source note/i,'site toxicologist memo');
      u.fill(/^body weight \\(kg\\)/i,'60');
      await u.sleep(300);
      document.querySelectorAll('main details.override-panel').forEach(d=>{d.open=true});
      await u.sleep(500)})()`,
  },
];
// --routes '#/docs,#/risk' limits the run to those routes (a prefix match), for a quick pass on one screen.
const ONLY = opt('routes');
const VIEWS = [
  { name: 'm390-light', w: 390, h: 844, mobile: true, dark: false },
  { name: 'm390-dark', w: 390, h: 844, mobile: true, dark: true },
  { name: 'd1280-light', w: 1280, h: 900, mobile: false, dark: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let baseUrl = opt('url');
if (!baseUrl) {
  server = spawn(
    'corepack',
    ['pnpm', '--filter', '@model-flow/web', 'preview', '--port', String(PORT), '--strictPort'],
    {
      stdio: 'ignore',
    },
  );
  baseUrl = `http://localhost:${PORT}/`;
}
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${join(tmpdir(), 'mobile-check-profile')}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const cleanup = () => {
  chrome.kill();
  server?.kill();
};
process.on('exit', cleanup);

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
const tabs = await until(async () =>
  (await (await fetch(`http://localhost:${DEBUG_PORT}/json`)).json()).filter(
    (t) => t.type === 'page',
  ),
);
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
const evaluateAsync = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
    ?.value;

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
        const b=[...document.querySelectorAll('main button')].find(x=>name.test(x.textContent.trim()||x.getAttribute('aria-label')||''));
        if(b){b.click();return true}
        await sleep(250);
      }
      return false;
    },
    fill(re,v){const l=labelled(re);const i=l&&(l.control||l.querySelector('input'));if(i)setValue(i,v);return !!i},
    tick(re){const l=labelled(re);const i=l&&(l.control||l.querySelector('input'));if(i&&!i.checked)i.click();return !!i},
  };
})()`;
const MEASURE = `(()=>{const cw=document.documentElement.clientWidth;
  const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>cw+0.5});
  return JSON.stringify({cw,sw:document.documentElement.scrollWidth,n:bad.length,
    bad:bad.slice(0,6).map(e=>e.tagName.toLowerCase()+(e.className&&e.className.baseVal===undefined?'.'+String(e.className).trim().split(/\\s+/).join('.'):'')),
    fedPanel:!!document.querySelector('[aria-label="Total TPH level"]'),fedProduce:[...document.querySelectorAll('main label')].some(l=>/plant factors for homegrown produce/i.test(l.textContent)&&!!l.querySelector('input:checked')),tables:document.querySelectorAll('main table').length,charts:document.querySelectorAll('main svg').length,
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
  const visits = [...ROUTES.map((route) => ({ route, via: null })), ...FED_ROUTES].filter(
    (v) => !ONLY || ONLY.split(',').some((o) => v.route === o || v.route.startsWith(`${o}/`)),
  );
  for (const { route, via, viaSetup, routeSetup, tag } of visits) {
    await send('Page.navigate', { url: baseUrl });
    await sleep(500);
    await evaluate(
      `try{localStorage.setItem('model_flow.project.autosave.v1',${JSON.stringify(JSON.stringify(SEED))})}catch(e){};location.hash=${JSON.stringify(via ?? route)};location.reload()`,
    );
    await sleep(1800);
    if (viaSetup) {
      await evaluate(UI);
      await evaluateAsync(viaSetup);
    }
    await evaluate(PRESS);
    if (via) {
      await evaluate(`location.hash=${JSON.stringify(route)}`);
      await sleep(1500);
      if (routeSetup) {
        await evaluate(UI);
        await evaluateAsync(routeSetup);
      }
      await evaluate(PRESS);
    }
    await sleep(800);
    const m = JSON.parse(await evaluate(MEASURE));
    const slug =
      (route.replace(/[#/]/g, '') || 'home') + (via ? '-fed' : '') + (tag ? `-${tag}` : '');
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      // the long committed documents are measured in full but only their first screen is captured
      captureBeyondViewport: !/^#\/docs\/(?!user-guide)/.test(route),
    });
    writeFileSync(join(outDir, `${view.name}-${slug}.png`), Buffer.from(shot.data, 'base64'));
    let axeBad = false;
    let axeNote = '';
    if (AXE) {
      const v = await runAxe();
      const hard = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      axeBad = hard.length > 0;
      axeReport.push({
        view: view.name,
        route: via ? `${route} (fed)` : tag ? `${route} (${tag})` : route,
        violations: v,
      });
      axeNote = ` axe=${hard.length}+${v.length - hard.length}`;
      for (const x of v)
        axeNote += `\n    [${x.impact}] ${x.id} (${x.count}): ${x.nodes.slice(0, 3).join(' | ')}`;
    }
    const bad = m.n > 0 || m.sw > m.cw || axeBad || (via && !(m.fedPanel && m.fedProduce));
    if (bad) failures++;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${view.name} ${route}${via ? ` (fed from ${via})` : tag ? ` (${tag})` : ''} cw=${m.cw} sw=${m.sw} overflow=${m.n}${via ? ` tphPanel=${m.fedPanel} produceSwitch=${m.fedProduce}` : ''} tables=${m.tables} charts=${m.charts}${m.n ? ' ' + m.bad.join(' ') : ''}${axeNote}`,
    );
  }
}
if (opt('axe-json')) writeFileSync(opt('axe-json'), JSON.stringify(axeReport, null, 1));
cleanup();
process.exit(failures ? 1 : 0);
