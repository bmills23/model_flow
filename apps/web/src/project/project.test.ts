import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM as TRANSPORT_DEFAULT } from '../transport/form';
import {
  buildProject,
  defaultScreens,
  feedEntry,
  isFeedStale,
  parseProject,
  screensOf,
} from './index';
import { CURRENT_VERSION } from './migrate';
import { PROJECT_FORMAT } from './schema';

const NOW = new Date('2026-10-18T12:30:00.000Z');

function sample() {
  const screens = defaultScreens();
  screens.transport = {
    form: { ...TRANSPORT_DEFAULT, K: '3.5', loading: 'pulse' },
    method: 'domenico',
  };
  return buildProject({
    screens,
    feeds: {
      well: feedEntry('transport', screens.transport.form, {
        method: 'modern',
        label: 'Well at 100 m',
        times: [0, 1, 2],
        values: [0, 0.5, 1],
      }),
    },
    data: { rsl: 'rsl-2024-11', nrwqc: 'nrwqc-2026-10-16', sediment: 'sediment-2026-10-16' },
    title: 'Site A',
    createdWith: '0.0.0',
    now: NOW,
  });
}

describe('buildProject', () => {
  it('stamps format, version, app version and the save time', () => {
    const p = sample();
    expect(p.format).toBe(PROJECT_FORMAT);
    expect(p.format).toBe('model_flow.project');
    expect(p.version).toBe(CURRENT_VERSION);
    expect(p.createdWith).toBe('0.0.0');
    expect(p.savedAt).toBe('2026-10-18T12:30:00.000Z');
    expect(p.title).toBe('Site A');
  });
  it('omits the title when none is given', () => {
    const p = buildProject({ screens: defaultScreens(), createdWith: '1', now: NOW });
    expect('title' in p).toBe(false);
  });
});

describe('parseProject', () => {
  it('loads what buildProject wrote after a trip through text, with no warnings', () => {
    const p = sample();
    const r = parseProject(JSON.stringify(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.project).toEqual(p);
    const screens = screensOf(r.project);
    expect(screens.transport.form.K).toBe('3.5');
    expect(screens.transport.method).toBe('domenico');
    expect(screens.risk.form.chemicals).toEqual([]);
  });

  it('accepts a parsed object as well as text', () => {
    expect(parseProject(JSON.parse(JSON.stringify(sample()))).ok).toBe(true);
  });

  it('gives each absent screen its defaults', () => {
    const r = parseProject({
      format: 'model_flow.project',
      version: 1,
      createdWith: '0.0.0',
      savedAt: '2026-10-18T12:30:00.000Z',
      screens: {},
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(screensOf(r.project)).toEqual(defaultScreens());
  });

  it('refuses text that is not JSON', () => {
    const r = parseProject('{ nope');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/i);
  });

  it('refuses a JSON document that is not a project', () => {
    for (const doc of [[], 'x', 3, null, { format: 'other', version: 1 }, { version: 1 }]) {
      const r = parseProject(JSON.stringify(doc));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/not a model_flow project/i);
    }
  });

  it('refuses a newer version than the app knows, naming both, and loads nothing', () => {
    const r = parseProject({ ...sample(), version: CURRENT_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain(String(CURRENT_VERSION + 1));
      expect(r.error).toMatch(/newer/i);
    }
  });

  it('refuses a missing, zero, negative or fractional version', () => {
    for (const version of [undefined, 0, -1, 1.5, '1']) {
      const r = parseProject({ ...sample(), version });
      expect(r.ok).toBe(false);
    }
  });

  it('refuses a bad save time and reports the path of the problem', () => {
    const r = parseProject({ ...sample(), savedAt: 'yesterday' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('savedAt');
  });

  it('refuses a wrong typed field inside a screen and names it', () => {
    const doc = JSON.parse(JSON.stringify(sample()));
    doc.screens.transport.form.K = 8.64;
    const r = parseProject(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('screens.transport.form.K');
  });

  it('drops unknown keys with a warning that names each one', () => {
    const doc = JSON.parse(JSON.stringify(sample()));
    doc.mystery = 1;
    doc.screens.transport.form.futureField = 'x';
    doc.screens.risk = { form: { additive: true, other: 1 } };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.path).sort()).toEqual([
      'mystery',
      'screens.risk.form.other',
      'screens.transport.form.futureField',
    ]);
    expect(r.warnings.every((w) => w.message.length > 0)).toBe(true);
    expect('mystery' in r.project).toBe(false);
    expect(screensOf(r.project).risk.form.additive).toBe(true);
  });

  it('drops a feed whose series arrays differ in length, keeps the screens and warns', () => {
    const doc = JSON.parse(JSON.stringify(sample()));
    doc.feeds.well.value.values = [1];
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.feeds?.['well']).toBeUndefined();
    expect(r.droppedFeeds).toEqual(['well']);
    expect(r.warnings.some((w) => w.path === 'feeds.well')).toBe(true);
    expect(screensOf(r.project).transport.form.K).toBe(screensOf(sample()).transport.form.K);
  });

  it('drops a non-finite series value the same way and keeps the other feeds', () => {
    const doc = JSON.parse(JSON.stringify(sample()));
    doc.feeds.well.value.values = [0, null, 1];
    doc.feeds.vaporRisk = {
      source: 'vapor',
      inputsHash: 'h',
      value: { chemicalId: '71-43-2', label: 'benzene' },
    };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.droppedFeeds).toEqual(['well']);
    expect(r.project.feeds?.['vaporRisk']).toBeDefined();
  });

  it('drops a feed key this build does not know with a warning', () => {
    const doc = JSON.parse(JSON.stringify(sample()));
    doc.feeds.vapor = { source: 'vapor', inputsHash: 'h', value: {} };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.project.feeds as Record<string, unknown> | undefined)?.['vapor']).toBeUndefined();
    expect(r.warnings.some((w) => w.path === 'feeds.vapor')).toBe(true);
  });
});

describe('feeds', () => {
  it('records the source and a hash of the form it was built from', () => {
    const p = sample();
    const e = p.feeds?.well;
    expect(e?.source).toBe('transport');
    expect(e?.inputsHash).toMatch(/^[0-9a-f]{8}$/);
  });
  it('reports a feed stale only when the source form changed', () => {
    const e = sample().feeds?.well;
    if (!e) throw new Error('no feed');
    const same = { ...TRANSPORT_DEFAULT, K: '3.5', loading: 'pulse' as const };
    expect(isFeedStale(e, same)).toBe(false);
    expect(isFeedStale(e, { ...same, K: '3.6' })).toBe(true);
  });
});
