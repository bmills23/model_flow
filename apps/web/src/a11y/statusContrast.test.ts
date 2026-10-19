// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// axe-core flagged the idle compute status line because the rule faded text with opacity, which drops
// it below the 4.5:1 contrast minimum. Text must keep its full-strength token colour.
describe('compute status line contrast', () => {
  const css = readFileSync(join(__dirname, '..', 'transport', 'transport.css'), 'utf8');
  const rule = (sel: string): string => {
    const m = new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
    expect(m, sel).toBeTruthy();
    return m![1]!;
  };
  it('does not fade the idle or active status text with opacity', () => {
    expect(rule('.status')).not.toMatch(/opacity/);
    expect(rule('.status.on')).not.toMatch(/opacity/);
  });
  it('shows the active state with a token colour, not a fade', () => {
    expect(rule('.status')).toMatch(/color:\s*var\(--muted\)/);
    expect(rule('.status.on')).toMatch(/color:\s*var\(--text\)/);
  });
});
