import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { references, registry } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import {
  buildValidationManifest,
  renderValidationJson,
  renderValidationMarkdown,
  type ValidationManifest,
} from '../src/validation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoot = resolve(root, 'packages/engine/test/fixtures');

const EM_DASH = String.fromCharCode(0x2014);

const manifest: ValidationManifest = buildValidationManifest({
  root,
  references,
  methodIds: registry.list().map((m) => m.id),
  methods: registry.list(),
});

function jsonFiles(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(fixtureRoot)) {
    if (!statSync(resolve(fixtureRoot, dir)).isDirectory()) continue;
    for (const f of readdirSync(resolve(fixtureRoot, dir))) {
      if (f.endsWith('.json')) out.push(`${dir}/${f}`);
    }
  }
  return out.sort();
}

describe('validation manifest', () => {
  it('lists every fixture directory', () => {
    const dirs = readdirSync(fixtureRoot).filter((d) =>
      statSync(resolve(fixtureRoot, d)).isDirectory(),
    );
    const covered = new Set(manifest.examples.flatMap((e) => e.files.map((f) => f.split('/')[0])));
    for (const d of dirs) expect(covered.has(d), `fixture directory ${d}`).toBe(true);
  });

  it('lists every fixture file', () => {
    const covered = new Set(manifest.examples.flatMap((e) => e.files));
    for (const f of jsonFiles()) expect(covered.has(f), `fixture file ${f}`).toBe(true);
  });

  it('points every example at an existing fixture, test, README and method', () => {
    for (const e of manifest.examples) {
      for (const f of e.files) expect(existsSync(resolve(fixtureRoot, f)), f).toBe(true);
      expect(existsSync(resolve(root, 'packages/engine/test', e.testFile)), e.testFile).toBe(true);
      for (const m of e.methodIds) expect(registry.has(m), m).toBe(true);
    }
  });

  it('cites only references that exist in references.json', () => {
    const keys = new Set(references.map((r) => r.key));
    for (const e of manifest.examples) {
      if (e.referenceKey !== null) expect(keys.has(e.referenceKey), e.referenceKey).toBe(true);
    }
    for (const d of manifest.unverified.defaults) {
      if (d.referenceKey !== null) expect(keys.has(d.referenceKey), d.referenceKey).toBe(true);
    }
  });

  it('gives every example a positive case count, a tolerance and a known status', () => {
    const statuses = ['reproduced', 'named exception', 'pending or deferred', 'smoke test only'];
    for (const e of manifest.examples) {
      expect(e.cases, e.id).toBeGreaterThan(0);
      expect(e.tolerance.length, e.id).toBeGreaterThan(0);
      expect(statuses).toContain(e.status);
    }
  });

  it('has unique example ids', () => {
    const ids = manifest.examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('counts the cases from the fixture files', () => {
    const byId = new Map(manifest.examples.map((e) => [e.id, e]));
    expect(byId.get('ssg1996-table-a1')?.cases).toBe(30);
    expect(byId.get('rsl-2024-11')?.cases).toBe(30 * 2 - blankCells());
    // 110 printed values, 8 of them named exceptions
    expect(byId.get('vga1982-a1')?.cases).toBe(102);
    expect(byId.get('vga1982-a1-exceptions')?.cases).toBe(8);
    expect(byId.get('vga1982-a1-exceptions')?.status).toBe('named exception');
  });

  it('takes the named exceptions and deferred rows of Table R-9 from the fixture', () => {
    const r9 = JSON.parse(readFileSync(resolve(fixtureRoot, 'exposure/r9.json'), 'utf8')) as {
      namedExceptions: { row: string }[];
      deferred: string[];
    };
    const names = manifest.examples.map((e) => e.title);
    expect(names.some((t) => t.includes(r9.namedExceptions[0]!.row))).toBe(true);
    expect(names.some((t) => t.includes(r9.deferred[0]!))).toBe(true);
  });

  it('reports a smoke-test-only status for Table R-2', () => {
    const e = manifest.examples.find((x) => x.id === 'table-r2');
    expect(e?.status).toBe('smoke test only');
  });

  it('lists planned references a shipped method relies on, and the warned defaults', () => {
    const keys = manifest.unverified.plannedReferences.map((p) => p.key);
    expect(keys).toContain('foster1986');
    expect(keys).toContain('trapp2015');
    const planned = references.filter((r) => r.status === 'planned').map((r) => r.key);
    for (const k of keys) expect(planned).toContain(k);
    const codes = manifest.unverified.defaults.map((d) => d.warningCode);
    expect(codes).toContain('shower.film-reference-unverified');
    expect(codes).toContain('shower.household-factor-unverified');
    const subjects = manifest.unverified.defaults.map((d) => d.subject).join(' | ');
    for (const s of ['Little', 'HHRAP', 'TSCF', 'Briggs', 'Schulze-Makuch', 'Gelhar']) {
      expect(subjects, s).toContain(s);
    }
  });

  it('rejects a manifest whose test evidence is missing', () => {
    expect(() =>
      buildValidationManifest({
        root,
        references,
        methodIds: registry.list().map((m) => m.id),
        methods: registry.list(),
        overrideEvidence: 'this string appears in no test file',
      }),
    ).toThrow(/evidence/);
  });
});

function blankCells(): number {
  const f = JSON.parse(readFileSync(resolve(fixtureRoot, 'exposure/rsl-2024-11.json'), 'utf8')) as {
    cases: { cancer: number | null; noncancer: number | null }[];
  };
  return f.cases.reduce(
    (n, c) => n + (c.cancer === null ? 1 : 0) + (c.noncancer === null ? 1 : 0),
    0,
  );
}

describe('validation documents', () => {
  const md = renderValidationMarkdown(manifest, '2026-10-21');
  const json = renderValidationJson(manifest);

  it('renders stable text with the generated line and no em dash', () => {
    expect(md).toMatch(/^Generated 2026-10-21 from /m);
    expect(md).not.toContain(EM_DASH);
    expect(json).not.toContain(EM_DASH);
    expect(renderValidationMarkdown(manifest, '2026-10-21')).toBe(md);
  });

  it('keeps the JSON small and parseable', () => {
    expect(json.length).toBeLessThan(60_000);
    const parsed = JSON.parse(json) as ValidationManifest;
    expect(parsed.examples.length).toBe(manifest.examples.length);
  });

  it('mentions every example title in the document', () => {
    for (const e of manifest.examples) expect(md).toContain(e.title);
  });

  it('matches the committed documents', () => {
    const committedMd = resolve(root, 'docs/VALIDATION.md');
    const committedJson = resolve(root, 'packages/data/generated/validation/validation.json');
    expect(existsSync(committedMd)).toBe(true);
    expect(readFileSync(committedJson, 'utf8')).toBe(json);
    const date = /^Generated (\d{4}-\d{2}-\d{2}) /m.exec(readFileSync(committedMd, 'utf8'))![1]!;
    expect(readFileSync(committedMd, 'utf8')).toBe(renderValidationMarkdown(manifest, date));
  });
});
