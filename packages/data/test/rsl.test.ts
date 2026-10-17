import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRsl, type RslBuild } from '../src/rsl/build.js';
import { verifyManifest } from '../src/rsl/checksums.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw/rsl/2024-11');
const generatedDir = resolve(here, '../generated/rsl-2024-11');

let built: RslBuild;
beforeAll(async () => {
  built = await buildRsl(rawDir);
}, 60_000);

const chem = (id: string) => built.chemicals.chemicals.find((c) => c.id === id);
const tox = (id: string) => built.tox.toxicity.find((t) => t.id === id);

describe('checksum manifest', () => {
  const copies: string[] = [];
  afterAll(() => copies.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const copy = () => {
    const d = mkdtempSync(join(tmpdir(), 'rsl-'));
    copies.push(d);
    cpSync(rawDir, d, { recursive: true });
    return d;
  };

  it('accepts the committed files', () => {
    expect(() => verifyManifest(rawDir)).not.toThrow();
  });

  it('fails on a checksum mismatch, for verify and for the build', async () => {
    const d = copy();
    const file = join(d, 'sems-405302.xlsx');
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    writeFileSync(file, bytes);
    expect(() => verifyManifest(d)).toThrow(/sems-405302\.xlsx.*checksum/i);
    await expect(buildRsl(d)).rejects.toThrow(/checksum/i);
  });

  it('fails when a listed file is missing', () => {
    const d = copy();
    rmSync(join(d, 'sems-405290.xlsx'));
    expect(() => verifyManifest(d)).toThrow(/sems-405290\.xlsx/);
  });
});

describe('structure', () => {
  it('records edition, sources and units', () => {
    expect(built.chemicals.edition).toBe('2024-11');
    expect(built.chemicals.source.reference).toBe('epa2024rsl');
    expect(built.chemicals.source.documents).toEqual([405302, 405290]);
    expect(built.tox.source.documents).toEqual([405270]);
    expect(built.chemicals.units.koc).toBe('L/kg');
    expect(built.tox.units.sfo).toBe('(mg/kg-d)-1');
    expect(built.tox.sourceKeys['I']).toBe('IRIS');
  });

  it('has unique chemical ids, identical in both files', () => {
    const ids = built.chemicals.chemicals.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(800);
    expect(built.tox.toxicity.map((t) => t.id)).toEqual(ids);
  });

  it('suffixes ids where one CAS number carries several rows', () => {
    const lead = built.chemicals.chemicals.filter((c) => c.cas === '7439-92-1');
    expect(lead).toHaveLength(2);
    for (const c of lead) expect(c.id.startsWith('7439-92-1-')).toBe(true);
  });

  it('gives rows without a CAS number a name slug id and no cas', () => {
    const none = built.chemicals.chemicals.filter((c) => c.cas === undefined);
    expect(none.length).toBeGreaterThan(0);
    for (const c of none) expect(c.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('keeps the printed name and strips the leading marker from the display name', () => {
    const bap = chem('50-32-8')!;
    expect(bap.rslName).toBe('~Benzo[a]pyrene');
    expect(bap.name).toBe('Benzo[a]pyrene');
  });

  it('marks the special-equation rows', () => {
    expect(tox('79-01-6')?.special).toBe('trichloroethylene');
    expect(tox('75-01-4')?.special).toBe('vinyl-chloride');
    expect(tox('71-43-2')?.special).toBeUndefined();
  });
});

describe('benzene', () => {
  it('carries toxicity values with per-value source tags', () => {
    expect(tox('71-43-2')).toMatchObject({
      name: 'Benzene',
      sfo: { value: 0.055, source: 'I' },
      iur: { value: 7.8e-6, source: 'I' },
      rfdo: { value: 0.004, source: 'I' },
      rfci: { value: 0.03, source: 'I' },
      volatile: true,
      mutagen: false,
      giabs: 1,
      csat: 1820,
    });
    expect(tox('71-43-2')!.absd).toBeUndefined();
  });

  it('carries physical values with their reference columns', () => {
    const v = chem('71-43-2')!.values;
    expect(v.mw).toEqual({ value: 78.115, ref: 'PHYSPROP' });
    expect(v.koc).toEqual({ value: 145.8, ref: 'EPI' });
    expect(v.logKow).toEqual({ value: 2.13, ref: 'PHYSPROP' });
    expect(v.s).toEqual({ value: 1790, ref: 'PHYSPROP' });
    expect(v.hlc).toEqual({ value: 0.00555, ref: 'PHYSPROP' });
    expect(v.kp).toEqual({ value: 0.0149, ref: 'EPI' });
    expect(chem('71-43-2')).toMatchObject({ fa: 1, inEpd: true });
  });

  it('leaves a blank Kd absent, never zero', () => {
    expect('kd' in chem('71-43-2')!.values).toBe(false);
  });
});

describe('arsenic, inorganic', () => {
  it('carries toxicity values with mixed source tags', () => {
    expect(tox('7440-38-2')).toMatchObject({
      sfo: { value: 1.5, source: 'I' },
      iur: { value: 0.0043, source: 'I' },
      rfdo: { value: 0.0003, source: 'I' },
      rfci: { value: 0.000015, source: 'C' },
      volatile: false,
      mutagen: false,
      giabs: 1,
      absd: 0.03,
    });
    expect(tox('7440-38-2')!.csat).toBeUndefined();
  });

  it('carries the SSL-sourced Kd and the RAGS E Kp reference', () => {
    const v = chem('7440-38-2')!.values;
    expect(v.mw).toEqual({ value: 74.922, ref: 'CRC' });
    expect(v.kd).toEqual({ value: 29, ref: 'SSL' });
    expect(v.kp).toEqual({ value: 0.001, ref: 'RAGSE' });
    expect('koc' in v).toBe(false);
    expect('hPrime' in v).toBe(false);
  });
});

describe('benzo(a)pyrene', () => {
  it('is a mutagen with its own source tags', () => {
    expect(tox('50-32-8')).toMatchObject({
      sfo: { value: 1, source: 'I' },
      iur: { value: 0.0006, source: 'I' },
      rfdo: { value: 0.0003, source: 'I' },
      rfci: { value: 0.000002, source: 'I' },
      volatile: false,
      mutagen: true,
      giabs: 1,
      absd: 0.13,
    });
  });

  it('reads the EPD flag from the tap water table', () => {
    expect(chem('50-32-8')).toMatchObject({ fa: 1, inEpd: false });
    expect(chem('50-32-8')!.values.koc).toEqual({ value: 587400, ref: 'EPI' });
  });
});

describe('tap water flags', () => {
  it('reads FA below one and keeps a real zero', () => {
    expect(chem('34256-82-1')).toMatchObject({ fa: 0.9, inEpd: true });
    const zeros = built.chemicals.chemicals.filter((c) => c.fa === 0);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('keeps a published zero value (not a blank)', () => {
    expect(chem('7440-67-7')!.values.vp).toEqual({ value: 0, ref: 'NIOSH' });
  });

  it('has both EPD outcomes', () => {
    const flags = new Set(built.chemicals.chemicals.map((c) => c.inEpd));
    expect(flags.has(true)).toBe(true);
    expect(flags.has(false)).toBe(true);
  });
});

describe('blanks and keys', () => {
  it('leaves a blank toxicity value absent with no source', () => {
    const acephate = tox('30560-19-1')!;
    expect(acephate.sfo).toBeUndefined();
    expect(acephate.iur).toBeUndefined();
    expect(acephate.rfci).toBeUndefined();
    expect(acephate.rfdo).toEqual({ value: 0.0003, source: 'O' });
  });

  it('never stores a zero where the RSL printed nothing, and every source key is mapped', () => {
    for (const t of built.tox.toxicity) {
      for (const k of ['sfo', 'iur', 'rfdo', 'rfci'] as const) {
        const e = t[k];
        if (e) expect(built.tox.sourceKeys[e.source]).toBeDefined();
      }
    }
    expect(JSON.stringify(built.tox)).not.toContain('null');
    expect(JSON.stringify(built.chemicals)).not.toContain('null');
  });
});

describe('generated files', () => {
  it('match a fresh build byte for byte', () => {
    const chemicals = readFileSync(join(generatedDir, 'chemicals.json'), 'utf8');
    const toxicity = readFileSync(join(generatedDir, 'tox.json'), 'utf8');
    expect(chemicals).toBe(JSON.stringify(built.chemicals, null, 2) + '\n');
    expect(toxicity).toBe(JSON.stringify(built.tox, null, 2) + '\n');
  });
});
