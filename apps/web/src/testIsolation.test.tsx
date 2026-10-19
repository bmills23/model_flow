import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The setup file clears per-test state (project store, storage, the route hash). These two tests run in
// order: the first leaves state behind on purpose, the second must not see it.
describe('state left behind by one test', () => {
  it('sets a route hash and storage and does not clean up', () => {
    window.location.hash = '#/vadose';
    localStorage.setItem('leak', '1');
    expect(window.location.hash).toBe('#/vadose');
  });

  it('is gone in the next test', () => {
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('leak')).toBeNull();
  });
});

// Test-only helpers use the `.testkit.` infix so they cannot be mistaken for app modules; nothing else
// outside a `*.test.*` file may import the test frameworks (that would pull them into the bundle).
describe('test frameworks stay out of app modules', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  it('only test and testkit files import vitest or testing-library', () => {
    const root = join(process.cwd(), 'src');
    const offenders = walk(root)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|testkit)\.(ts|tsx)$/.test(f))
      .filter((f) => f !== join(root, 'test-setup.ts'))
      .filter((f) =>
        /from\s+['"](vitest|@testing-library\/[^'"]+)['"]/.test(readFileSync(f, 'utf8')),
      )
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
