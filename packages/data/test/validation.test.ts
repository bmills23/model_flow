import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { references, registry } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { sweepExamples } from '../src/validationCatalogSweep.js';
import {
  buildValidationManifest,
  type CatalogInput,
  markersIn,
  type ExampleSpec,
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

  it('records what the 2026-10-21 source check read', () => {
    const rows = new Map(manifest.unverified.defaults.map((d) => [d.referenceKey, d]));
    expect(rows.get('briggs1982')?.note).toContain('page 500');
    expect(rows.get('briggs1982')?.note).toContain('0.82');
    expect(rows.get('gelhar1985')?.note).toContain('no primary source');
    expect(rows.get('epa2024rslug')?.note).toContain('0.5 L/m3');
    expect(rows.get('epa1996ssg')?.note).toContain('Table 36');
    expect(rows.get('epa1996ssg')?.note).toContain('Table 39');
    const gelhar = references.find((r) => r.key === 'gelhar1985');
    expect(gelhar?.notes ?? '').toContain('no primary source');
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
    // The cap guards the size of what the report and validation pages load. Both import the file statically into their
    // own lazy chunks (apps/web/src/report/ReportPage.tsx, basisView.ts), so it is parsed once with the chunk and is
    // far below the 500 kB chunk limit of bundleSize.test.ts. The old cap of 60,000 left under 400 characters of room, which
    // one catalog entry uses up; 70,000 is about 17 percent above the roughly 59,600 characters of wave Z, enough for several
    // entries, and still small enough that growth beyond it is a decision, not drift.
    expect(json.length).toBeLessThan(70_000);
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

describe('warned default ids and scopes', () => {
  const defaults = manifest.unverified.defaults;

  it('gives every default a unique id and a known scope', () => {
    const ids = defaults.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of defaults) {
      expect(d.id, d.subject).toMatch(/^[a-z0-9]+(-[a-z0-9.]+)*$/);
      expect(['warning', 'method']).toContain(d.scope);
    }
  });

  it('scopes a default by warning code only when it has one', () => {
    for (const d of defaults) {
      if (d.scope === 'warning') expect(d.warningCode, d.id).not.toBeNull();
      else expect(d.methodIds.length, d.id).toBeGreaterThan(0);
    }
    const byCode = defaults.filter((d) => d.warningCode !== null);
    expect(byCode.map((d) => d.scope)).toEqual(byCode.map(() => 'warning'));
  });

  it('lists the saturated Gelhar log-quadratic as a warning-scoped default', () => {
    const d = defaults.find((x) => x.methodIds.includes('dispersivity.gelhar1985-api1987'));
    expect(d?.scope).toBe('warning');
    expect(d?.warningCode).toBe('dispersivity.regression-unsourced');
    expect(d?.referenceKey).toBe('gelhar1985');
    expect(d?.note).toContain('EA-4190');
    expect(d?.note).toContain('no primary source');
  });

  it('lists vadose.layered on the vadose regression', () => {
    const d = defaults.find((x) => x.id === 'gelhar-vadose-regression');
    expect(d?.methodIds).toEqual(['vadose.vadsat', 'vadose.layered']);
  });

  it('warns on the vadose regression by its own code', () => {
    const d = defaults.find((x) => x.id === 'gelhar-vadose-regression');
    expect(d?.scope).toBe('warning');
    expect(d?.warningCode).toBe('vadose.dispersivity-regression-unsourced');
  });

  it('rejects duplicate ids, a warning scope without a code and a method scope without methods', () => {
    const base = {
      subject: 's',
      methodIds: ['m.a'],
      warningCode: null,
      referenceKey: null,
      note: 'n',
      where: { file: 'README.md', needle: 'model' },
    };
    const run = (defs: CatalogInput['defaults']) =>
      buildValidationManifest({
        root,
        references: [],
        methodIds: ['m.a'],
        methods: [],
        catalog: { examples: [], derived: () => [], defaults: defs, notChecked: [] },
      });
    expect(() =>
      run([
        { ...base, id: 'a', scope: 'method' },
        { ...base, id: 'a', scope: 'method' },
      ]),
    ).toThrow(/duplicate/i);
    expect(() => run([{ ...base, id: 'a', scope: 'warning' }])).toThrow(/warning code/);
    expect(() => run([{ ...base, id: 'a', scope: 'method', methodIds: [] }])).toThrow(/method/);
  });

  it('starts the sweep extension point empty and reads data file counts', () => {
    expect(sweepExamples.map((e) => e.id)).toEqual([
      'rsl-sweep-tapwater',
      'rsl-sweep-soil-resident',
      'rsl-sweep-soil-industrial',
      'rsl-sweep-air',
      'nrwqc-hardness-metals',
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'validation-data-'));
    mkdirSync(join(dir, 'packages/engine/test'), { recursive: true });
    mkdirSync(join(dir, 'packages/data/generated/q'), { recursive: true });
    writeFileSync(join(dir, 'packages/data/generated/q/d.json'), '{"rows":[1,2,3]}\n');
    writeFileSync(join(dir, 'packages/engine/test/x.test.ts'), '// published-reproduction: dx\n');
    const m = buildValidationManifest({
      root: dir,
      references: [],
      methodIds: [],
      methods: [],
      catalog: {
        examples: [
          {
            id: 'dx',
            title: 'DX',
            files: [],
            dataFiles: ['q/d.json'],
            referenceKey: null,
            sourceText: 's',
            methodIds: [],
            compares: 'c',
            count: (_j, _t, data) => (data[0].rows as unknown[]).length,
            casesUnit: 'u',
            tolerance: 't',
            status: 'reproduced',
            testFile: 'x.test.ts',
            evidence: [],
          },
        ],
        derived: () => [],
        defaults: [],
        notChecked: [],
      },
    });
    expect(m.examples[0]?.cases).toBe(3);
    expect(m.examples[0]?.dataFiles).toEqual(['q/d.json']);
    expect(manifest.examples.every((e) => Array.isArray(e.dataFiles))).toBe(true);
  });
});

describe('tolerance evidence is exact, not a substring', () => {
  const dir = mkdtempSync(join(tmpdir(), 'validation-'));
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  write('packages/engine/test/fixtures/d/README.md', 'NEEDLE\n');
  write('packages/engine/test/fixtures/d/f.json', '{"tolerance":5e-7,"cases":[1,2]}\n');
  const spec = (over: Partial<ExampleSpec>): ExampleSpec => ({
    id: 'x',
    title: 'X',
    files: ['d/f.json'],
    referenceKey: null,
    sourceText: 's',
    methodIds: ['m.a'],
    compares: 'c',
    count: (j) => (j[0].cases as unknown[]).length,
    casesUnit: 'u',
    tolerance: 't',
    status: 'reproduced',
    testFile: 'x.test.ts',
    evidence: [{ text: '5.1e-7', count: 2 }],
    readmeNeedle: 'NEEDLE',
    ...over,
  });
  const build = (s: ExampleSpec, testSource: string) => {
    write('packages/engine/test/x.test.ts', testSource);
    return buildValidationManifest({
      root: dir,
      references: [],
      methodIds: ['m.a'],
      methods: [],
      catalog: { examples: [s], derived: () => [], defaults: [], notChecked: [] },
    });
  };

  it('accepts the counted literal', () => {
    expect(build(spec({}), 'f(5.1e-7);\ng(5.1e-7);\n').examples).toHaveLength(1);
  });

  it('rejects one of two shared tolerances loosened while the other keeps the literal', () => {
    expect(() => build(spec({}), 'f(5.1e-6);\ng(5.1e-7);\n')).toThrow(/appears 1 times/);
  });

  it('rejects one of several repeated assertions loosened', () => {
    const six = Array.from({ length: 6 }, () => 'lt(0.005)').join('\n');
    const s = spec({ evidence: [{ text: 'lt(0.005)', count: 6 }] });
    expect(build(s, six).examples).toHaveLength(1);
    expect(() => build(s, six.replace('lt(0.005)', 'lt(0.05)'))).toThrow(/appears 5 times/);
  });

  it('rejects a fixture tolerance that no longer matches the stated value', () => {
    const s = spec({ evidence: [], pins: [{ path: 'tolerance', value: 5e-7 }] });
    expect(build(s, '').examples).toHaveLength(1);
    write('packages/engine/test/fixtures/d/f.json', '{"tolerance":5e-6,"cases":[1,2]}\n');
    expect(() => build(s, '')).toThrow(/fixture value tolerance/);
  });

  it('requires the reproduction marker when there is no fixture file', () => {
    const s = spec({ files: [], evidence: [], count: () => 2 });
    delete s.readmeNeedle;
    expect(() => build(s, 'nothing')).toThrow(/no "published-reproduction: x" line/);
    expect(build(s, '// published-reproduction: x\n').examples[0]!.files).toEqual([]);
    expect(() => build(s, '// published-reproduction: x-other\n')).toThrow(/no "published/);
  });
});

describe('published reproductions outside the fixture directories', () => {
  const testDir = resolve(root, 'packages/engine/test');
  const marked = readdirSync(testDir)
    .filter((f) => f.endsWith('.test.ts'))
    .flatMap((f) => markersIn(readFileSync(resolve(testDir, f), 'utf8')).map((id) => ({ f, id })));

  it('lists every marked test reproduction, in the test file that carries the marker', () => {
    expect(marked.length).toBeGreaterThan(0);
    for (const { f, id } of marked) {
      const e = manifest.examples.find((x) => x.id === id);
      expect(e, `${f} marks ${id}`).toBeDefined();
      expect(e?.testFile, id).toBe(f);
    }
  });

  it('has a marker for every example that has no fixture file', () => {
    const ids = new Set(marked.map((m) => m.id));
    for (const e of manifest.examples.filter((x) => x.files.length === 0)) {
      expect(ids.has(e.id), e.id).toBe(true);
    }
  });

  it('lists the wildlife Eco-SSL, SSG PEF, NRWQC zinc, Table R-7 theta and Henry reproductions', () => {
    const byId = new Map(manifest.examples.map((e) => [e.id, e]));
    expect(byId.get('eco-wildlife-ecossl')?.cases).toBe(12);
    for (const id of [
      'eco-wildlife-guild',
      'ssg1996-default-pef',
      'ssg2002-default-pef',
      'nrwqc-zinc-hardness',
      'r7-theta',
      'epa2004-henry-temperature',
    ]) {
      expect(byId.get(id)?.status, id).toBe('reproduced');
    }
  });

  it('lists each RSL sweep with the cells compared and its reproduced, excepted and unexplained counts', () => {
    const byId = new Map(manifest.examples.map((e) => [e.id, e]));
    const fixture = JSON.parse(
      readFileSync(resolve(fixtureRoot, 'rsl-sweep/exceptions.json'), 'utf8'),
    ) as {
      sweeps: Record<
        string,
        { compared: number; reproduced: number; excepted: number; unexplained: number }
      >;
    };
    for (const id of ['tapwater', 'soil-resident', 'soil-industrial', 'air']) {
      const e = byId.get(`rsl-sweep-${id}`);
      const s = fixture.sweeps[id]!;
      expect(e?.cases, id).toBe(s.compared);
      expect(e?.dataFiles, id).toEqual(['rsl-2024-11/screening-levels.json']);
      expect(e?.files, id).toEqual(['rsl-sweep/exceptions.json']);
      expect(e?.status, id).toBe('reproduced');
      for (const n of [s.reproduced, s.excepted, s.unexplained]) {
        expect(e?.compares, id).toContain(String(n));
      }
      expect(e?.testFile, id).toBe('rsl-tables-sweep.test.ts');
    }
    // the Aroclor totals are printed as unexplained, with the published and computed values
    expect(byId.get('rsl-sweep-tapwater')?.note).toContain('Aroclor 1242');
    expect(byId.get('rsl-sweep-tapwater')?.note).toContain('0.0078');
    expect(byId.get('rsl-sweep-tapwater')?.note).toContain('0.007852');
    expect(byId.get('nrwqc-hardness-metals')?.cases).toBe(10);
    expect(byId.get('nrwqc-hardness-metals')?.testFile).toBe('surfacewater-criteria.test.ts');
  });

  it('gives the Table R-3 to R-5 entry six printed results', () => {
    expect(manifest.examples.find((e) => e.id === 'risc-r3-r5')?.cases).toBe(6);
  });

  it('ties each derived Table R-9 row to the test that handles it', () => {
    const byId = new Map(manifest.examples.map((e) => [e.id, e]));
    expect(byId.get('r9-exception-inhalation-in-shower')?.testFile).toBe('household-e4.test.ts');
    expect(byId.get('r9-deferred-ingestion-of-root-vegetables-m9')?.testFile).toBe(
      'household-e4.test.ts',
    );
  });
});
