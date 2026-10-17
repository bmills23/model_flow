import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { modernChemical, modernPathway, modernResident } from '@model-flow/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { partitionFactor } from '../../engine/src/processes/cleanup/ssg.js';
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

  it('carries the risk subset, derived from the chemical file and under a third of its size', () => {
    const risk = readFileSync(join(generatedDir, 'risk-chemicals.json'), 'utf8');
    expect(risk).toBe(JSON.stringify(built.risk, null, 2) + '\n');
    const full = readFileSync(join(generatedDir, 'chemicals.json'), 'utf8');
    expect(risk.length).toBeLessThan(full.length * 0.3);
    const byId = new Map(built.chemicals.chemicals.map((c) => [c.id, c]));
    for (const r of built.risk.chemicals) {
      const c = byId.get(r.id)!;
      expect(r.fa).toBe(c.fa);
      expect(r.inEpd).toBe(c.inEpd);
      expect(r.dermalForm).toBe(c.dermalForm);
      for (const [k, v] of Object.entries(r.values)) {
        expect(v.value).toBe(c.values[k as keyof typeof c.values]!.value);
      }
    }
    // every chemical with a Kp or a dermal form is in the subset
    for (const c of built.chemicals.chemicals) {
      if (c.values.kp || c.dermalForm)
        expect(byId.has(c.id) && built.risk.chemicals.some((r) => r.id === c.id)).toBe(true);
    }
  });
});

describe('dermal water form (organic lag-time or inorganic Kp times t)', () => {
  it('classifies the metals and the organics the screen needs', () => {
    const form = (name: string) =>
      built.chemicals.chemicals.find((c) => c.rslName === name)?.dermalForm;
    expect(form('Cadmium (Water)')).toBe('inorganic');
    expect(form('Chromium(VI)')).toBe('inorganic');
    expect(form('~Mercuric Chloride (and other Mercury salts)')).toBe('inorganic');
    expect(form('Zinc and Compounds')).toBe('inorganic');
    expect(form('Arsenic, Inorganic')).toBe('inorganic');
    expect(form('Benzene')).toBe('organic');
    expect(form('Acetone')).toBe('organic');
  });

  it('leaves the form absent where the tap water table publishes no dermal value', () => {
    const none = built.chemicals.chemicals.find((c) => c.rslName === 'Cadmium (Diet)');
    expect(none?.dermalForm).toBeUndefined();
  });

  it('reproduces every published tap water dermal value with the stated form, and not the other', async () => {
    const sheets = await readXlsxFile(join(rawDir, 'sems-405290.xlsx'));
    const rows = (sheets[0]!.data as unknown[][]).slice(3);
    const chemicals = built.chemicals.chemicals;
    const toxById = new Map(built.tox.toxicity.map((t) => [t.id, t]));
    expect(rows.length).toBe(chemicals.length);
    let checked = 0;
    chemicals.forEach((c, n) => {
      const v = c.values;
      const t = toxById.get(c.id)!;
      const pub = [
        ['risk', rows[n]![17]],
        ['hq', rows[n]![21]],
      ].filter((p): p is [string, number] => typeof p[1] === 'number');
      if (v.kp === undefined) return;
      if (pub.length === 0) {
        expect(c.dermalForm, `${c.rslName} has no published dermal value`).toBeUndefined();
        return;
      }
      // log distance from the published values for one form
      const distance = (organic: boolean): number => {
        const chem = modernChemical({
          id: c.id,
          mutagen: t.mutagen,
          sfo: t.sfo?.value,
          iur: t.iur?.value,
          rfdo: t.rfdo?.value,
          rfci: t.rfci?.value,
          giabs: t.giabs,
          absd: t.absd,
          csat: t.csat,
          kp: v.kp?.value,
          tauEvent: v.tauEvent?.value,
          tStar: v.tStar?.value,
          b: v.b?.value,
          fa: c.fa,
          inEpd: c.inEpd,
          special: t.special,
          organic,
        });
        const cell = modernPathway('waterDermal', modernResident(), chem, 1);
        let worst = 0;
        for (const [kind, published] of pub) {
          const per = kind === 'risk' ? cell.riskPerEpc : cell.hqPerEpc;
          const sl = per === null ? Number.NaN : (kind === 'risk' ? 1e-6 : 1) / per / 1e-6;
          worst = Math.max(worst, Number.isFinite(sl) ? Math.abs(Math.log(sl / published)) : 9);
        }
        return worst;
      };
      const form = distance(true) <= distance(false) ? 'organic' : 'inorganic';
      expect(c.dermalForm, `${c.rslName}`).toBe(form);
      checked += 1;
    });
    expect(checked).toBeGreaterThan(600);
  }, 60_000);
});

describe('MCL and published soil-to-groundwater SSL columns (slice D2)', () => {
  const rows = () => built.tox.toxicity;

  it('reads the MCL cell for 108 rows, the "(G)" cells parsed to their number', () => {
    const withCell = rows().filter((t) => t.mcl !== undefined || t.mclGroup === true);
    expect(withCell).toHaveLength(108);
    expect(tox('71-43-2')!.mcl).toBe(5);
    expect(tox('71-43-2')!.mclGroup).toBeUndefined();
    // chloroform prints 8.0E+01(G): the number is kept and the marker flagged
    expect(tox('67-66-3')!.mcl).toBe(80);
    expect(tox('67-66-3')!.mclGroup).toBe(true);
  });

  it('flags every "(G)" cell, and a bare "(G)" carries the flag with no number', () => {
    const grouped = rows().filter((t) => t.mclGroup === true);
    expect(grouped).toHaveLength(25);
    const bare = grouped.filter((t) => t.mcl === undefined);
    expect(bare.map((t) => t.name).sort()).toEqual([
      'Perfluorobutanesulfonate',
      'Perfluorobutanesulfonic acid (PFBS)',
    ]);
    expect(rows().filter((t) => t.mcl !== undefined)).toHaveLength(106);
  });

  it('keeps the published SSLs as comparison values: 747 risk-based with a key, 91 MCL-based', () => {
    const risk = rows().filter((t) => t.publishedSsl?.risk);
    const mcl = rows().filter((t) => t.publishedSsl?.mcl !== undefined);
    expect(risk).toHaveLength(747);
    expect(mcl).toHaveLength(91);
    for (const t of risk) expect(['c', 'c*', 'c**', 'n']).toContain(t.publishedSsl!.risk!.key);
    expect(tox('71-43-2')!.publishedSsl!.mcl).toBeGreaterThan(0);
    expect(built.tox.units.mcl).toBe('ug/L');
    expect(built.tox.units.publishedSsl).toBe('mg/kg');
  });

  it('fixture 2: all 91 MCL-based SSLs reproduce with the engine partition factor', () => {
    const byId = new Map(built.chemicals.chemicals.map((c) => [c.id, c]));
    let checked = 0;
    for (const t of rows()) {
      const published = t.publishedSsl?.mcl;
      if (published === undefined) continue;
      expect(t.mcl, t.name).toBeDefined();
      const v = byId.get(t.id)!.values;
      const p = partitionFactor({
        soil: { rhoB: 1500, rhoS: 2650, foc: 0.002, theta: 0.3 },
        ...(v.kd ? { kd: v.kd.value * 1e-3 } : { koc: v.koc!.value * 1e-3 }),
        H: v.hPrime?.value ?? 0,
      });
      const mgPerKg = t.mcl! * 1e-6 * p * 1e6;
      const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
      expect(
        Math.abs(mgPerKg - published),
        `${t.name}: ${mgPerKg} vs ${published}`,
      ).toBeLessThanOrEqual(0.5 * unit * (1 + 1e-9));
      checked++;
    }
    expect(checked).toBe(91);
  });

  it('writes cleanup-chemicals.json as exactly the derived subset', () => {
    const file = readFileSync(join(generatedDir, 'cleanup-chemicals.json'), 'utf8');
    expect(file).toBe(JSON.stringify(built.cleanup, null, 2) + '\n');
    const byId = new Map(built.chemicals.chemicals.map((c) => [c.id, c]));
    const keys = ['koc', 'kd', 'hPrime', 's', 'mw'] as const;
    const expected = built.chemicals.chemicals
      .filter((c) => keys.some((k) => c.values[k]))
      .map((c) => c.id);
    expect(built.cleanup.chemicals.map((c) => c.id)).toEqual(expected);
    for (const r of built.cleanup.chemicals) {
      const c = byId.get(r.id)!;
      expect(Object.keys(r.values).sort()).toEqual(keys.filter((k) => c.values[k]).sort());
      for (const k of keys) {
        const v = c.values[k];
        if (v) expect(r.values[k]!.value).toBe(v.value);
      }
      expect(r.values.kd?.ref).toBe(c.values.kd?.ref);
    }
    expect(Object.keys(built.cleanup.units).sort()).toEqual([...keys].sort());
    const full = readFileSync(join(generatedDir, 'chemicals.json'), 'utf8');
    expect(file.length).toBeLessThan(full.length * 0.5);
    expect(built.cleanup.chemicals.find((c) => c.id === '71-43-2')!.values.koc!.value).toBe(
      byId.get('71-43-2')!.values.koc!.value,
    );
  });
});
