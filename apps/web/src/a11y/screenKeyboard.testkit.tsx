import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { positiveTabindex, tabbables, unreachableControls } from './tabOrder';

/** Every screen the keyboard-order checks visit. They are spread over several test files (see the `*.routes-*` files) so the 300 ms settle waits of the slices overlap. */
export const ROUTES = [
  '',
  '#/transport',
  '#/vadose',
  '#/saturated',
  '#/vapor',
  '#/surface-water',
  '#/household',
  '#/plants-eco',
  '#/site',
  '#/chemicals',
  '#/risk',
  '#/cleanup',
  '#/report',
  '#/methods',
  '#/docs',
  '#/docs/user-guide',
  '#/docs/uncertainty',
  '#/docs/vapor-models',
  '#/docs/attributions',
];

afterEach(() => {
  window.location.hash = '';
});

export async function openRoute(hash: string) {
  window.location.hash = hash;
  const view = render(<App />);
  const main = await screen.findByRole('main');
  // wait for the lazy screen chunk to replace its loading line
  await waitFor(() => expect(main.textContent ?? '').not.toMatch(/^\s*Loading the/), {
    timeout: 20000,
  });
  await new Promise((r) => setTimeout(r, 300));
  return { ...view, main };
}

/** Register the keyboard-order checks for the given screens. */
export function defineKeyboardOrder(routes: readonly string[]): void {
  describe('keyboard order on every screen', () => {
    for (const hash of routes) {
      describe(hash || '#/ (landing)', () => {
        it('has no positive tabindex, so Tab follows the document order', async () => {
          const { container } = await openRoute(hash);
          expect(positiveTabindex(container).map((e) => e.outerHTML.slice(0, 120))).toEqual([]);
        }, 40000);

        it('leaves no native control out of the tab order', async () => {
          const { container } = await openRoute(hash);
          expect(unreachableControls(container).map((e) => e.outerHTML.slice(0, 120))).toEqual([]);
        }, 40000);

        it('reaches the skip link first, then the navigation, before the main content', async () => {
          const { container, main } = await openRoute(hash);
          const order = tabbables(container);
          expect(order[0]?.textContent).toMatch(/skip to main content/i);
          const firstInMain = order.findIndex((e) => main.contains(e));
          const nav = order.findIndex((e) => e.closest('nav'));
          if (firstInMain >= 0 && nav >= 0) expect(nav).toBeLessThan(firstInMain);
          // nothing after the main content jumps back before it
          const lastInMain = order.map((e) => main.contains(e)).lastIndexOf(true);
          const interleaved = order
            .slice(firstInMain, lastInMain + 1)
            .filter((e) => !main.contains(e));
          expect(interleaved).toEqual([]);
        }, 40000);

        it('moves focus into main when the skip link is used', async () => {
          const { main } = await openRoute(hash);
          fireEvent.click(screen.getByRole('link', { name: /skip to main content/i }));
          expect(document.activeElement).toBe(main);
          expect(window.location.hash).toBe(hash);
        }, 40000);

        it('lists every focusable control in main in document order', async () => {
          const { main } = await openRoute(hash);
          const order = tabbables(main);
          const dom = Array.from(main.querySelectorAll('*'));
          const idx = order.map((e) => dom.indexOf(e));
          expect(idx).toEqual([...idx].sort((a, b) => a - b));
        }, 40000);
      });
    }
  });
}
