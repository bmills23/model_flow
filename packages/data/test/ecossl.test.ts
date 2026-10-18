import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEcossl, serialize, type EcosslBuild } from '../src/ecossl/build.js';
import { DOCUMENTS, GUIDANCE_FILE } from '../src/ecossl/documents.js';
import { sha256, verifyManifest } from '../src/ecossl/manifest.js';
import { pdfPageText, pdftotextAvailable } from '../src/ecossl/reader.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(here, '../raw/ecossl/2026-10-18');
const generatedFile = resolve(here, '../generated/ecossl-2026-10-18/ecossl.json');

let built: EcosslBuild;
beforeAll(() => {
  built = buildEcossl(rawDir);
});

const value = (substance: string, group: string) =>
  built.values.find((v) => v.substance === substance && v.group === group);
const wild = (substance: string, group: string, surrogate: string) =>
  built.wildlife.find(
    (w) => w.substance === substance && w.group === group && w.surrogate === surrogate,
  );

describe('checksum manifest', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const synthetic = (bytes: string, manifestSha: string, size = bytes.length) => {
    const d = mkdtempSync(join(tmpdir(), 'ecossl-'));
    dirs.push(d);
    writeFileSync(join(d, 'a.pdf'), bytes);
    writeFileSync(
      join(d, 'manifest.json'),
      JSON.stringify({
        edition: 'x',
        retrieved: '2026-10-18',
        listingPageDate: '2026-04-21',
        files: [
          {
            file: 'a.pdf',
            role: 'chemical',
            reference: 'epaecossl',
            url: 'u',
            bytes: size,
            sha256: manifestSha,
          },
        ],
      }),
    );
    return d;
  };

  it('lists the 21 chemical documents and the guidance, each with a SHA-256', () => {
    const m = verifyManifest(rawDir, { allowMissing: true }).manifest;
    const chem = m.files.filter((f) => f.role === 'chemical');
    expect(chem).toHaveLength(21);
    expect(m.files.filter((f) => f.role === 'guidance').map((f) => f.file)).toEqual([
      GUIDANCE_FILE,
    ]);
    expect(DOCUMENTS).toHaveLength(21);
    for (const f of m.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const doc of DOCUMENTS) {
      const f = chem.find((x) => x.file === doc.file);
      expect(f?.directive).toBe(doc.directive);
      expect(f?.date).toBe(doc.date);
    }
  });

  it('accepts a matching file and rejects a checksum or size mismatch', () => {
    const ok = synthetic('hello', sha256(Buffer.from('hello')));
    expect(() => verifyManifest(ok)).not.toThrow();
    const bad = synthetic('hello', sha256(Buffer.from('other')));
    expect(() => verifyManifest(bad)).toThrow(/a\.pdf.*checksum/i);
    const size = synthetic('hello', sha256(Buffer.from('hello')), 99);
    expect(() => verifyManifest(size)).toThrow(/size/i);
  });

  it('fails on a missing file unless missing files are allowed', () => {
    const d = synthetic('hello', sha256(Buffer.from('hello')));
    rmSync(join(d, 'a.pdf'));
    expect(() => verifyManifest(d)).toThrow(/a\.pdf.*missing/i);
    expect(verifyManifest(d, { allowMissing: true }).missing).toEqual(['a.pdf']);
  });

  it('verifies the fetched PDFs when they are present', () => {
    const { present } = verifyManifest(rawDir, { allowMissing: true });
    // Every PDF on disk matches its recorded checksum (verifyManifest throws otherwise).
    expect(present.length).toBeGreaterThanOrEqual(0);
  });
});

describe('summary values (Table 2.1)', () => {
  it('reproduces the published Eco-SSLs read from the documents', () => {
    expect(value('cadmium', 'plants')?.value).toBe(32);
    expect(value('cadmium', 'invertebrates')?.value).toBe(140);
    expect(value('cadmium', 'avian')?.value).toBe(0.77);
    expect(value('cadmium', 'mammalian')?.value).toBe(0.36);
    expect(value('lead', 'plants')?.value).toBe(120);
    expect(value('lead', 'invertebrates')?.value).toBe(1700);
    expect(value('lead', 'avian')?.value).toBe(11);
    expect(value('lead', 'mammalian')?.value).toBe(56);
    expect(value('chromium-iii', 'avian')?.value).toBe(26);
    expect(value('chromium-vi', 'mammalian')?.value).toBe(130);
    expect(value('pah-hmw', 'mammalian')?.value).toBe(1.1);
  });

  it('keeps not-available groups as explicit statuses, never as numbers', () => {
    expect(value('antimony', 'plants')).toMatchObject({ status: 'NA', value: null });
    expect(value('chromium-iii', 'plants')).toMatchObject({ status: 'NC', value: null });
    expect(value('chromium-vi', 'avian')).toMatchObject({ status: 'NA', value: null });
    expect(value('aluminum', 'plants')).toMatchObject({ status: 'procedure', value: null });
    expect(value('iron', 'mammalian')).toMatchObject({ status: 'procedure', value: null });
  });

  it('covers four groups for each of the 23 substances of the 21 documents', () => {
    const subs = new Set(built.values.map((v) => v.substance));
    expect(subs.size).toBe(23);
    for (const s of subs) expect(built.values.filter((v) => v.substance === s)).toHaveLength(4);
    for (const doc of DOCUMENTS) for (const s of doc.substances) expect(subs.has(s)).toBe(true);
  });

  it('gives every number a document, table and page', () => {
    for (const v of built.values) {
      expect(v.document).toBeTruthy();
      expect(v.table).toBeTruthy();
      expect(v.page).toBeGreaterThan(0);
    }
  });

  it('the wildlife value is the smallest derived surrogate value', () => {
    for (const group of ['avian', 'mammalian'] as const) {
      for (const sub of new Set(
        built.wildlife.filter((w) => w.group === group).map((w) => w.substance),
      )) {
        const rows = built.wildlife.filter((w) => w.substance === sub && w.group === group);
        const derived = rows.flatMap((r) => (r.ecoSsl === null ? [] : [r.ecoSsl]));
        expect(value(sub, group)?.value, `${sub} ${group}`).toBe(Math.min(...derived));
      }
    }
  });
});

/** Solve FIR * (S * Ps + Bi(S)) / TRV = 1 for the soil concentration S (mg/kg dw). */
const backCalculate = (w: NonNullable<ReturnType<typeof wild>>): number => {
  const bi = (s: number): number => {
    const c = (w.cdiet ?? 1) * s;
    if (w.form === 'ln') return Math.exp(w.a! * Math.log(s) + w.b!);
    if (w.form === 'affine') return w.a! * c + w.b!;
    return w.a! * c;
  };
  const hq = (s: number): number => (w.fir * (s * w.ps + bi(s))) / w.trv;
  let lo = 1e-9;
  let hi = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (hq(mid) < 1) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
};

describe('wildlife derivation inputs (Tables 5.2, 6.2, 6.3, 6.4)', () => {
  it('has avian and mammalian surrogate rows with page citations', () => {
    expect(built.wildlife.length).toBe(108);
    for (const w of built.wildlife) {
      expect(w.page, `${w.substance} ${w.surrogate}`).toBeGreaterThan(0);
      expect(['dove', 'woodcock', 'hawk', 'vole', 'shrew', 'weasel']).toContain(w.surrogate);
    }
  });

  it('solving dose = TRV for the soil concentration reproduces every unflagged printed Eco-SSL within 5 percent', () => {
    const misses: string[] = [];
    for (const w of built.wildlife) {
      if (w.ecoSsl === null || w.flag !== null) continue;
      const got = backCalculate(w);
      if (Math.abs(got - w.ecoSsl) / w.ecoSsl > 0.05) {
        misses.push(
          `${w.substance} ${w.group} ${w.surrogate}: printed ${w.ecoSsl}, computed ${got.toPrecision(4)}`,
        );
      }
    }
    expect(misses).toEqual([]);
  });

  it('flags exactly the rows whose printed inputs do not reproduce the printed value', () => {
    const flagged = built.wildlife
      .filter((w) => w.flag !== null)
      .map((w) => `${w.substance} ${w.group} ${w.surrogate}`);
    expect(flagged.sort()).toEqual([
      'copper mammalian vole',
      'pah-lmw mammalian weasel',
      'pcp avian hawk',
      'pcp mammalian weasel',
      'selenium avian woodcock',
      'vanadium avian hawk',
      'vanadium mammalian weasel',
    ]);
    // Every flagged row really misses by more than 5 percent as printed.
    for (const w of built.wildlife.filter((x) => x.flag !== null)) {
      expect(
        Math.abs(backCalculate(w) - w.ecoSsl!) / w.ecoSsl!,
        `${w.substance} ${w.surrogate}`,
      ).toBeGreaterThan(0.05);
    }
  });

  it('the flagged rows reproduce under the stated alternative reading', () => {
    const alt = (
      s: string,
      g: string,
      sur: string,
      patch: Partial<NonNullable<ReturnType<typeof wild>>>,
    ) => {
      const w = { ...wild(s, g, sur)!, ...patch };
      return Math.abs(backCalculate(w) - w.ecoSsl!) / w.ecoSsl!;
    };
    // the standard hawk and weasel parameters printed in the other documents
    expect(alt('pcp', 'avian', 'hawk', { fir: 0.0353, ps: 0.057 })).toBeLessThan(0.05);
    expect(alt('pcp', 'mammalian', 'weasel', { ps: 0.043 })).toBeLessThan(0.05);
    // the earthworm factor not applied to the prey diet
    expect(alt('vanadium', 'avian', 'hawk', { cdiet: null })).toBeLessThan(0.05);
    expect(alt('vanadium', 'mammalian', 'weasel', { cdiet: null })).toBeLessThan(0.05);
  });

  it('records the cadmium and lead fixtures of the methods note', () => {
    expect(wild('cadmium', 'mammalian', 'shrew')).toMatchObject({
      trv: 0.77,
      form: 'ln',
      a: 0.795,
      b: 2.114,
    });
    expect(wild('lead', 'avian', 'woodcock')).toMatchObject({ trv: 1.63, ecoSsl: 11 });
    expect(wild('nickel', 'avian', 'woodcock')).toMatchObject({ form: 'NA', ecoSsl: null });
  });
});

describe('pdftotext cross-check', { timeout: 180_000 }, () => {
  const ready = pdftotextAvailable() && existsSync(join(rawDir, DOCUMENTS[0]!.file));
  const docOf = (sub: string) => DOCUMENTS.find((d) => d.substances.includes(sub))!;
  const printed = (n: number | null, raw: string): string[] => {
    // the printed forms of a number: as typed in the table, or with a thousands comma
    const out = [raw];
    const abs = raw.replace(/^-/, '');
    out.push(abs);
    const [int, frac] = abs.split('.');
    if (int && int.length > 3)
      out.push(int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : ''));
    void n;
    return out;
  };

  it.skipIf(!ready)('finds every hand-entered wildlife number on its cited page', () => {
    const misses: string[] = [];
    for (const w of built.wildlife) {
      const file = join(rawDir, docOf(w.substance).file);
      const text = pdfPageText(file, w.page, w.page + 1);
      const fields: [string, string][] = [
        ['trv', w.raw.trv],
        ['fir', w.raw.fir],
        ['ps', w.raw.ps],
        ['a', w.raw.a],
        ['b', w.raw.b],
        ['cdiet', w.raw.cdiet],
        ['ecoSsl', w.raw.ecoSsl],
      ];
      for (const [name, raw] of fields) {
        if (raw === '' || raw === 'NA') continue;
        if (
          !printed(null, raw).some((p) =>
            new RegExp(`(?<![0-9.])${p.replace('.', '\\.')}(?![0-9])`).test(text),
          )
        ) {
          misses.push(`${w.substance} ${w.group} ${w.surrogate} ${name}=${raw} (page ${w.page})`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it.skipIf(!ready)('finds every hand-entered summary value on its cited page', () => {
    const misses: string[] = [];
    for (const v of built.values) {
      const text = pdfPageText(join(rawDir, docOf(v.substance).file), v.page, v.page).replace(
        /\s+/g,
        ' ',
      );
      if (v.status === 'value') {
        if (
          !printed(v.value, v.raw.value).some((p) =>
            new RegExp(`(?<![0-9.])${p.replace('.', '\\.')}(?![0-9])`).test(text),
          )
        ) {
          misses.push(`${v.substance} ${v.group}=${v.raw.value}`);
        }
      } else if (!text.includes(v.evidence)) {
        misses.push(`${v.substance} ${v.group}: evidence "${v.evidence}" not on page ${v.page}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it.skipIf(!ready)('reads each document cover date and directive number from the PDF', () => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const misses: string[] = [];
    for (const d of DOCUMENTS) {
      const text = pdfPageText(join(rawDir, d.file), 1, 1).replace(/\s+/g, ' ');
      const [y, m] = (d.revised ?? d.date).split('-');
      if (!text.includes(`${months[Number(m) - 1]} ${y}`))
        misses.push(`${d.key}: date ${d.revised ?? d.date}`);
      if (!text.replace(/- /, '-').includes(d.directive))
        misses.push(`${d.key}: directive ${d.directive}`);
    }
    expect(misses).toEqual([]);
  });

  it('reports a skip reason rather than passing silently', () => {
    if (!ready)
      console.warn(
        'ecossl cross-check skipped: pdftotext or the fetched PDFs are absent (checksum check only)',
      );
    expect(typeof ready).toBe('boolean');
  });
});

describe('generated ecossl.json', () => {
  it('equals the build output, so the committed file is current', () => {
    expect(readFileSync(generatedFile, 'utf8')).toBe(serialize(built.json));
  });

  it('carries provenance, licence status and the unmapped substances', () => {
    const j = built.json;
    expect(j.edition).toBe('2026-10-18');
    expect(j.source.reference).toBe('epaecossl');
    expect(j.source.listingPageDate).toBe('2026-04-21');
    expect(j.source.licence).toMatch(/public domain/i);
    expect(j.source.documents).toHaveLength(21);
    expect(j.source.documents.every((d) => /^[0-9a-f]{64}$/.test(d.sha256))).toBe(true);
    expect(j.unmapped.map((u) => u.substance).sort()).toEqual(['pah-hmw', 'pah-lmw']);
  });

  it('maps substances to existing chemical ids and reports the rest', () => {
    const chems = JSON.parse(
      readFileSync(resolve(here, '../generated/rsl-2024-11/chemicals.json'), 'utf8'),
    ) as { chemicals: { id: string }[] };
    const ids = new Set(chems.chemicals.map((c) => c.id));
    for (const s of built.json.substances) {
      for (const id of s.chemicalIds) expect(ids.has(id), `${s.substance} -> ${id}`).toBe(true);
    }
    const cd = built.json.substances.find((s) => s.substance === 'cadmium');
    expect(cd?.chemicalIds).toContain('7440-43-9-cadmium-diet');
    const mapped = new Set(built.json.substances.map((s) => s.substance));
    for (const u of built.json.unmapped) expect(mapped.has(u.substance)).toBe(false);
  });

  it('is deterministic', () => {
    expect(serialize(buildEcossl(rawDir).json)).toBe(serialize(built.json));
  });
});

void execFileSync;
