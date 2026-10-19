import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, declaredTokens } from './contrast';

const SRC = join(__dirname, '..');

function lightAndDark(file: string): {
  light: Record<string, string>;
  dark: Record<string, string>;
} {
  const css = readFileSync(join(SRC, file), 'utf8');
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  const darkMedia = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  expect(root, `${file} declares :root tokens`).toBeTruthy();
  expect(darkMedia, `${file} declares dark tokens`).toBeTruthy();
  const light = declaredTokens(root![1]!);
  return { light, dark: { ...light, ...declaredTokens(darkMedia![1]!) } };
}

describe('contrast helper', () => {
  it('gives 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});

describe('colour tokens meet WCAG 2.2 AA', () => {
  const { light, dark } = lightAndDark('styles.css');
  const textPairs: [string, string][] = [
    ['--text', '--bg'],
    ['--text', '--surface'],
    ['--muted', '--bg'],
    ['--muted', '--surface'],
    ['--accent-text', '--accent'],
    ['--legacy', '--legacy-bg'],
    ['--modern', '--modern-bg'],
    ['--accent', '--bg'],
    ['--accent', '--surface'],
  ];
  for (const [name, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg] of textPairs) {
      it(`${name}: ${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${name}: the focus indicator (--accent) is at least 3:1 against both backgrounds`, () => {
      expect(contrastRatio(tokens['--accent']!, tokens['--bg']!)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tokens['--accent']!, tokens['--surface']!)).toBeGreaterThanOrEqual(3);
    });
  }
});

function tokensOf(file: string) {
  const css = readFileSync(join(SRC, file), 'utf8');
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  const dm = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  expect(root, `${file} declares :root tokens`).toBeTruthy();
  const base = lightAndDark('styles.css');
  const own = declaredTokens(root![1]!);
  return {
    light: { ...base.light, ...own },
    dark: { ...base.dark, ...own, ...(dm ? declaredTokens(dm[1]!) : {}) },
  };
}

/** Chart marks and graphical objects need 3:1 (WCAG 1.4.11); text pairs need 4.5:1 (1.4.3). */
const MARKS: [string, string[]][] = [
  ['transport/transport.css', ['--s-legacy', '--s-modern', '--s-domenico', '--ramp-hi']],
  [
    'vadose/vadose.css',
    ['--b-source', '--b-volatilized', '--b-transit', '--b-delivered', '--water'],
  ],
  ['risk/risk.css', ['--r-0', '--r-1', '--r-2', '--r-3', '--r-4', '--r-5', '--r-6', '--r-7']],
  ['saturated/saturated.css', ['--soil-line', '--flow']],
];
const TEXT: [string, string, string][] = [
  ['transport/transport.css', '--alert-text', '--alert-bg'],
  ['vadose/vadose.css', '--ok-text', '--surface'],
  ['vadose/vadose.css', '--off-text', '--surface'],
  ['risk/risk.css', '--tag-text', '--tag-bg'],
];

describe('chart marks and component text', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const [file, names] of MARKS) {
      const t = tokensOf(file)[mode];
      for (const n of names) {
        it(`${mode}: ${file} ${n} on --surface is at least 3:1`, () => {
          expect(contrastRatio(t[n]!, t['--surface']!)).toBeGreaterThanOrEqual(3);
        });
      }
    }
    for (const [file, fg, bg] of TEXT) {
      it(`${mode}: ${file} ${fg} on ${bg} is at least 4.5:1`, () => {
        const t = tokensOf(file)[mode];
        expect(contrastRatio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
