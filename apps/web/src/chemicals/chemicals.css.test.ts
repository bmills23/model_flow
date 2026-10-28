import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/chemicals/chemicals.css', 'utf8');

describe('chemicals.css step layout', () => {
  it('puts the step class on the same element as the chemicals class, so the two-column rule matches', () => {
    // ChemicalsStep renders <section class="vadose chemicals chem-step">: chem-step is not a descendant of chemicals
    expect(css).not.toMatch(/\.chemicals\s+\.chem-step/);
    expect(css).toMatch(
      /@media \(min-width: 900px\)\s*\{\s*\.chemicals\.chem-step \.chem-lists\s*\{/,
    );
  });
});
