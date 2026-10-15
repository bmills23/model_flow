import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('shows the six RISC-style steps in the navigation', () => {
    render(<App />);
    const nav = screen.getByRole('navigation');
    for (const label of [
      'Chemicals',
      'Site model',
      'Transport',
      'Receptors',
      'Risk & cleanup',
      'Results',
    ]) {
      expect(nav.textContent).toContain(label);
    }
  });

  it('carries the non-affiliation notice in the footer', () => {
    render(<App />);
    expect(screen.getByRole('contentinfo').textContent).toMatch(/not affiliated/i);
  });

  it('opens the Methods & References page from the navigation', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /methods/i });
    expect(link).toBeTruthy();
  });
});
