// Mobile layout check: drives an installed Chrome through CDP device emulation (no dependencies).
// Usage: corepack pnpm mobile:check [--url http://localhost:5178/] [--chrome <path>] [--out <dir>]
// Without --url it serves the built app with `vite preview` on port 5178 (build first).
// Visits every route at a true 390x844 viewport in light and dark, plus once at 1280x900, after
// pressing the compute buttons so result tables and charts are on screen, and counts elements whose
// right edge exceeds the document client width. Exits 1 if any count is above 0.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
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
  '#/risk',
  '#/cleanup',
  '#/report',
  '#/methods',
  '#/docs',
];
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

const PRESS = `(async()=>{
  const re=/^(calculate|compute|run|solve|evaluate|send to|load an example|start from|add a|apply)/i;
  for(let pass=0;pass<5;pass++){
    for(const b of document.querySelectorAll('main button')){
      if(!b.disabled&&re.test(b.textContent.trim())) b.click();
    }
    await new Promise(r=>setTimeout(r,700));
  }
})()`;
const MEASURE = `(()=>{const cw=document.documentElement.clientWidth;
  const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>cw+0.5});
  return JSON.stringify({cw,sw:document.documentElement.scrollWidth,n:bad.length,
    bad:bad.slice(0,6).map(e=>e.tagName.toLowerCase()+(e.className&&e.className.baseVal===undefined?'.'+String(e.className).trim().split(/\\s+/).join('.'):'')),
    tables:document.querySelectorAll('main table').length,charts:document.querySelectorAll('main svg').length,
    small:[...document.querySelectorAll('main button,main a,main input,main select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<44)}).length})})()`;

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
  for (const route of ROUTES) {
    await send('Page.navigate', { url: baseUrl });
    await sleep(500);
    await evaluate(
      `try{localStorage.setItem('model_flow.project.autosave.v1',${JSON.stringify(JSON.stringify(SEED))})}catch(e){};location.hash=${JSON.stringify(route)};location.reload()`,
    );
    await sleep(1800);
    await evaluate(PRESS);
    await sleep(800);
    const m = JSON.parse(await evaluate(MEASURE));
    const slug = route.replace(/[#/]/g, '') || 'home';
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    writeFileSync(join(outDir, `${view.name}-${slug}.png`), Buffer.from(shot.data, 'base64'));
    const bad = m.n > 0 || m.sw > m.cw;
    if (bad) failures++;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${view.name} ${route} cw=${m.cw} sw=${m.sw} overflow=${m.n} tables=${m.tables} charts=${m.charts}${m.n ? ' ' + m.bad.join(' ') : ''}`,
    );
  }
}
cleanup();
process.exit(failures ? 1 : 0);
