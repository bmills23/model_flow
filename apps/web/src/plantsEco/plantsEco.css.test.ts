import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'plantsEco.css'), 'utf8');

/** Every rule as its selector list and its declaration text, in source order. */
function rules(source: string): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    out.push({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! });
  }
  return out;
}

/** Declarations applied to a selector across all rules whose selector list names it exactly. */
function declared(selector: string): string {
  return rules(css)
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.body)
    .join(';');
}

describe('plantsEco compare table cell styling', () => {
  it('keeps the shared header and body cell declarations on th', () => {
    const th = declared('.plants-eco table.compare th');
    for (const prop of [
      'text-align: left',
      'padding: 6px 6px',
      'border-bottom',
      'min-width: 0',
      'overflow-wrap: anywhere',
      'vertical-align: top',
    ]) {
      expect(th).toContain(prop);
    }
  });

  it('keeps the shared cell declarations on td', () => {
    const td = declared('.plants-eco table.compare td');
    expect(td).toContain('text-align: left');
    expect(td).toContain('overflow-wrap: anywhere');
  });

  it('does not put the repro flag into the th or td selector list', () => {
    for (const r of rules(css)) {
      if (r.selectors.includes('.plants-eco .repro-flag')) {
        expect(r.selectors.some((s) => s.endsWith(' th') || s.endsWith(' td'))).toBe(false);
      }
    }
  });
});
