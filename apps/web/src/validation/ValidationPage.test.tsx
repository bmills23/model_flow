import validation from '@model-flow/data/generated/validation/validation.json';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { ValidationPage } from './ValidationPage';

afterEach(() => {
  window.location.hash = '';
});

describe('ValidationPage', () => {
  it('states what the evidence does and does not show', () => {
    render(<ValidationPage />);
    expect(screen.getByText(/nothing is checked against RISC5 outputs/i)).toBeTruthy();
  });

  it('renders every manifest example with its source, tolerance and status', () => {
    render(<ValidationPage />);
    const table = screen.getByRole('table', { name: /worked examples/i });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBe(validation.examples.length + 1);
    for (const ex of validation.examples) {
      const row = rows.find((r) => r.querySelector('code')?.textContent === ex.id)!;
      expect(row).toBeTruthy();
      expect(row.textContent).toContain(ex.title);
      expect(row.textContent).toContain(ex.source);
      expect(row.textContent).toContain(ex.compares);
      expect(row.textContent).toContain(ex.tolerance);
      expect(row.textContent).toContain(ex.status);
      expect(row.textContent).toContain(String(ex.cases));
    }
  });

  it('lists every unverified item', () => {
    render(<ValidationPage />);
    const text = document.body.textContent ?? '';
    for (const r of validation.unverified.plannedReferences) {
      expect(text).toContain(r.title);
      for (const id of r.reliedOnBy) expect(text).toContain(id);
    }
    for (const r of validation.unverified.otherPlannedReferences) expect(text).toContain(r.title);
    for (const d of validation.unverified.defaults) expect(text).toContain(d.subject);
    for (const n of validation.unverified.notChecked) expect(text).toContain(n.subject);
  });

  it('keeps headings in reading order and adds no custom tab stops', () => {
    render(<ValidationPage />);
    const heads = screen.getAllByRole('heading').map((h) => h.tagName);
    expect(heads[0]).toBe('H1');
    expect(heads.slice(1).every((t) => t === 'H2' || t === 'H3')).toBe(true);
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"])').length).toBe(0);
  });
});

describe('validation route and links', () => {
  it('renders at #/validation with a Help link', async () => {
    window.location.hash = '#/validation';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /validation/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Help' })).toBeTruthy();
  });

  it('is linked from the nav and the home page, after methods and before documentation', () => {
    render(<App />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links.filter((h) => h === '#/validation').length).toBeGreaterThanOrEqual(2);
    const i = links.indexOf('#/validation');
    expect(i).toBeGreaterThan(links.indexOf('#/methods'));
    expect(i).toBeLessThan(links.indexOf('#/docs'));
  });

  it('is linked from the methods page', async () => {
    window.location.hash = '#/methods';
    render(<App />);
    const link = await screen.findByRole('link', { name: /validation page/i });
    expect(link.getAttribute('href')).toBe('#/validation');
    await waitFor(() => expect(link).toBeTruthy());
  });
});
