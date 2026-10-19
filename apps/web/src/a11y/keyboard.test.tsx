import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('keyboard operation of the shell', () => {
  it('puts a skip link first in the tab order, pointing at the main landmark', () => {
    const { container } = render(<App />);
    const first = container.querySelector('a, button, input, select, textarea, summary');
    expect(first?.textContent).toMatch(/skip to main content/i);
    const target = first!.getAttribute('href')!.slice(1);
    const main = screen.getByRole('main');
    expect(main.id).toBe(target);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus to main when the skip link is used', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: /skip to main content/i }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('does not change the route hash, which would leave the current screen', () => {
    window.location.hash = '#/vadose';
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: /skip to main content/i }));
    expect(window.location.hash).toBe('#/vadose');
    window.location.hash = '';
  });

  it('marks the current page in the navigation', () => {
    window.location.hash = '#/vadose';
    render(<App />);
    const current = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.length).toBeGreaterThan(0);
    window.location.hash = '';
  });
});

describe('visible focus in both themes', () => {
  const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
  it('has one global :focus-visible rule drawn with the accent token at 2px or more', () => {
    const m = /:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/outline:\s*(\d+)px solid var\(--accent\)/);
    const w = Number(/outline:\s*(\d+)px/.exec(m![1]!)![1]);
    expect(w).toBeGreaterThanOrEqual(2);
  });
  it('never removes the outline without a replacement', () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\s*;/);
  });
  it('has a skip link style that reveals it on focus', () => {
    expect(css).toMatch(/\.skip-link:focus/);
  });
});
