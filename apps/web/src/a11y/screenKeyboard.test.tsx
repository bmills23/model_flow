import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../vadose/DataTable';
import { tabbables, positiveTabindex, unreachableControls } from './tabOrder';
import { defineKeyboardOrder, openRoute, ROUTES } from './screenKeyboardOrder';

defineKeyboardOrder(ROUTES.slice(0, 5));

describe('tab order helpers detect real defects', () => {
  it('flags a positive tabindex and a control removed from the tab order', () => {
    const { container } = render(
      <div>
        <button tabIndex={2}>a</button>
        <button tabIndex={-1}>b</button>
        <button disabled>c</button>
        <button>d</button>
        <div tabIndex={0}>e</div>
        <details>
          <summary>f</summary>
          <button>inside closed</button>
        </details>
      </div>,
    );
    expect(positiveTabindex(container).map((e) => e.textContent)).toEqual(['a']);
    expect(unreachableControls(container).map((e) => e.textContent)).toEqual(['b']);
    expect(tabbables(container).map((e) => e.textContent)).toEqual(['a', 'd', 'e', 'f']);
  });
});

describe('disclosure widgets', () => {
  it('the data-table toggle is a real button that keeps focus and reports its state', () => {
    render(<DataTable caption="c" columns={['x']} rows={[['1']]} />);
    const b = screen.getByRole('button', { name: /show data table/i });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.focus();
    fireEvent.click(b);
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('table')).toBeTruthy();
    // a scrollable table must be reachable by keyboard (axe: scrollable-region-focusable)
    const region = screen.getByRole('region', { name: /c, scrollable/ });
    expect(region.tabIndex).toBe(0);
  });

  it('toggle with the keyboard: a button with aria-expanded keeps focus and flips its state', async () => {
    const { main } = await openRoute('#/vadose');
    // load an example so a chart and its data-table button exist where the screen offers one
    const buttons = Array.from(main.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
    for (const b of buttons) {
      b.focus();
      const before = b.getAttribute('aria-expanded');
      fireEvent.click(b);
      expect(document.activeElement).toBe(b);
      expect(b.getAttribute('aria-expanded')).not.toBe(before);
    }
  }, 40000);

  it('every details group opens from its summary, which is a tab stop', async () => {
    // the transport form draws its inputs inside open `details` groups
    const { main } = await openRoute('#/transport');
    const summaries = Array.from(main.querySelectorAll('details > summary'));
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(tabbables(main.ownerDocument.body)).toContain(s);
    }
  }, 40000);

  it('the only dialog markup is the shared AlertDialog, which has its own focus tests', () => {
    const root = join(__dirname, '..');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) return walk(p);
        return /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : [];
      });
    const offenders = walk(root).filter((p) =>
      /<dialog|aria-modal|role="(alert)?dialog"/.test(readFileSync(p, 'utf8')),
    );
    // A dialog needs focus-in, Escape and focus-return tests of its own; ui/AlertDialog.tsx has them
    // (ui/AlertDialog.test.tsx), so any other file that draws one fails here.
    expect(offenders.map((p) => p.slice(root.length + 1))).toEqual(['ui/AlertDialog.tsx']);
  });
});

describe('visual order matches document order', () => {
  const walkCss = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      if (statSync(p).isDirectory()) return walkCss(p);
      return f.endsWith('.css') ? [p] : [];
    });
  it('no stylesheet reorders flex or grid items away from the document order', () => {
    const offenders = walkCss(join(__dirname, '..')).flatMap((p) => {
      const css = readFileSync(p, 'utf8');
      const hits = css.match(/(^|[;{\s])order\s*:\s*-?\d+|-reverse\b/g) ?? [];
      return hits.map((h) => `${p}: ${h.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});
