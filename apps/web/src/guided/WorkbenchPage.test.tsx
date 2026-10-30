import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WORKBENCH_ROUTES } from '../steps';
import { WorkbenchPage } from './WorkbenchPage';

afterEach(cleanup);

describe('WorkbenchPage', () => {
  it('says its runs do not feed the steps', () => {
    render(<WorkbenchPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Model workbench' })).toBeTruthy();
    expect(document.body.textContent).toMatch(/do not feed the steps/i);
  });

  it('lists every workbench route once, with its address', () => {
    render(<WorkbenchPage />);
    const list = screen.getByRole('list', { name: /workbench screens/i });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(WORKBENCH_ROUTES.map((r) => r.href));
    for (const r of WORKBENCH_ROUTES) {
      expect(within(list).getByRole('link', { name: r.label })).toBeTruthy();
    }
  });

  it('names the report and the validation and methods pages', () => {
    render(<WorkbenchPage />);
    expect(screen.getByRole('link', { name: 'Workbench report' }).getAttribute('href')).toBe(
      '#/workbench/report',
    );
    expect(screen.getByRole('link', { name: 'Validation' }).getAttribute('href')).toBe(
      '#/validation',
    );
    expect(screen.getByRole('link', { name: /methods and references/i }).getAttribute('href')).toBe(
      '#/methods',
    );
  });

  it('points back to the steps, and uses no long dash', () => {
    render(<WorkbenchPage />);
    expect(
      screen.getByRole('link', { name: /start the guided flow|back to the steps/i }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('\u2014');
  });
});
