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

  it('links to the vadose leaching screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /vadose leaching/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/vadose');
  });

  it('links to the saturated soil source screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /saturated soil source/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/saturated');
  });

  it('links to the exposure and risk screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /exposure and risk/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/risk');
  });

  it('links to the cleanup levels screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /cleanup levels/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/cleanup');
  });

  it('opens the cleanup levels screen at #/cleanup', async () => {
    window.location.hash = '#/cleanup';
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /cleanup levels/i }, { timeout: 20000 }),
    ).toBeTruthy();
    window.location.hash = '';
  }, 30000);

  it('links to the vapor screen from the navigation and renders it on its route', async () => {
    window.location.hash = '#/vapor';
    render(<App />);
    const link = screen.getAllByRole('link', { name: /vapor intrusion/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/vapor');
    expect(await screen.findByRole('heading', { level: 1, name: /vapor intrusion/i })).toBeTruthy();
    window.location.hash = '';
  });
});
