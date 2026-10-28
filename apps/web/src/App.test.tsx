import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { currentProject, forgetMemory, getScreen, loadProject, setScreen } from './project/store';
import { clearWellFeed, setWellFeed } from './transport/wellFeed';

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

  it('links to the household screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /shower, irrigation and particulates/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/household');
  });

  it('opens the household screen at #/household', async () => {
    window.location.hash = '#/household';
    render(<App />);
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: /shower, irrigation/i },
        { timeout: 20000 },
      ),
    ).toBeTruthy();
    window.location.hash = '';
  });

  it('links to the plants, ecology and TPH screen and opens it at #/plants-eco', async () => {
    window.location.hash = '#/plants-eco';
    render(<App />);
    const link = screen.getAllByRole('link', { name: /plants, ecology and tph/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/plants-eco');
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: /plants, ecology and tph/i },
        { timeout: 20000 },
      ),
    ).toBeTruthy();
    window.location.hash = '';
  }, 30000);

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

  it('links to the surface water screen from the navigation', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: /surface water and sediment/i })[0]!;
    expect(link.getAttribute('href')).toBe('#/surface-water');
  });

  it('opens the surface water screen at #/surface-water', async () => {
    window.location.hash = '#/surface-water';
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /surface water and sediment/i }),
    ).toBeTruthy();
    window.location.hash = '';
  });

  it('links to the report and opens it at #/report', async () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Report' }).getAttribute('href')).toBe('#/report');
  });

  it('opens the report screen at #/report', async () => {
    window.location.hash = '#/report';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Report' })).toBeTruthy();
    window.location.hash = '';
  });
  it('links to the documentation and opens the reader at #/docs and #/docs/user-guide', async () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Documentation' }).getAttribute('href')).toBe('#/docs');
    cleanup();
    window.location.hash = '#/docs/user-guide';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'User guide' })).toBeTruthy();
    window.location.hash = '';
  });

  it('has no disabled step and links every step to a route', () => {
    window.location.hash = '';
    render(<App />);
    const nav = screen.getByRole('navigation');
    const steps = nav.querySelectorAll('ol.steps li');
    expect(steps).toHaveLength(6);
    expect(nav.querySelectorAll('.steps button')).toHaveLength(0);
    const hrefs = [...steps].map((li) => li.querySelector('a')?.getAttribute('href'));
    expect(hrefs).toEqual([
      '#/chemicals',
      '#/site',
      '#/transport',
      '#/risk',
      '#/cleanup',
      '#/report',
    ]);
  });

  it('marks only the step that owns the current route', () => {
    window.location.hash = '#/vadose';
    render(<App />);
    const current = screen
      .getByRole('navigation')
      .querySelectorAll('ol.steps a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain('Transport');
    window.location.hash = '';
  });

  it('marks no step on the home page, which names no placeholder and links the report', () => {
    window.location.hash = '';
    render(<App />);
    expect(document.querySelectorAll('ol.steps a[aria-current]')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/placeholder/i);
    const main = document.getElementById('main')!;
    expect(main.querySelector('a[href="#/report"]')).toBeTruthy();
  });
});

describe('stale values banner', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      clearWellFeed();
      forgetMemory();
    });
  });
  const well = {
    method: 'modern' as const,
    label: 'Receptor well',
    times: [0, 10],
    values: [0, 1e-6],
  };
  const editK = (k: string): void =>
    act(() => {
      const t = getScreen('transport');
      setScreen('transport', { ...t, form: { ...t.form, K: k } });
    });
  const note = /built from inputs that have since changed/i;

  it('appears the moment the sending screen is edited and goes when it is edited back', () => {
    render(<App />);
    const k = getScreen('transport').form.K;
    act(() => setWellFeed(well));
    expect(screen.queryByText(note)).toBeNull();
    editK('99');
    expect(screen.getByText(note).textContent).toMatch(
      /receptor well concentration \(transport\)/i,
    );
    editK(k);
    expect(screen.queryByText(note)).toBeNull();
  });

  it('stays dismissed for the same stale feed and comes back for a later one', () => {
    render(<App />);
    act(() => setWellFeed(well));
    editK('99');
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(note)).toBeNull();
    editK('98');
    expect(screen.queryByText(note)).toBeNull();
    act(() => setWellFeed(well));
    editK('97');
    expect(screen.getByText(note)).toBeTruthy();
  });

  it('a dismissal made in one project does not hide the note of the next project opened', () => {
    render(<App />);
    act(() => setWellFeed(well));
    editK('99');
    const staleProject = currentProject();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(note)).toBeNull();
    act(() => loadProject(staleProject));
    expect(screen.getByText(note)).toBeTruthy();
  });
});

describe('guided flow routes', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('links to the guided steps from the home page and leaves the main navigation alone', () => {
    window.location.hash = '';
    render(<App />);
    const link = screen.getByRole('link', { name: /start the guided flow/i });
    expect(link.getAttribute('href')).toBe('#/step/chemicals');
    expect(screen.getByRole('navigation', { name: 'Main' }).textContent).toContain(
      'Risk & cleanup',
    );
    expect(screen.queryByRole('navigation', { name: /guided steps/i })).toBeNull();
  });

  it.each([
    ['chemicals', 'Chemicals', 'Chemicals of concern'],
    ['site', 'Site model'],
    ['properties', 'Site properties'],
    ['sources', 'Source values'],
    ['run', 'Run and view'],
    ['pathways', 'Pathways'],
    ['receptors', 'Receptors'],
    ['toxicity', 'Toxicity', 'Toxicity values'],
    ['targets', 'Risk or cleanup', 'Risk or cleanup levels'],
    ['results', 'Results'],
  ] as [string, string, string?][])(
    'renders the shell for #/step/%s with that step open',
    async (id, label, heading) => {
      window.location.hash = `#/step/${id}`;
      render(<App />);
      const steps = await screen.findByRole('navigation', { name: /guided steps/i });
      expect(steps.querySelector('[aria-current="step"]')?.textContent ?? '').toContain(label);
      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: heading ?? label },
          { timeout: 20000 },
        ),
      ).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
      expect(screen.getByRole('link', { name: /^back$/i })).toBeTruthy();
    },
  );

  it('shows steps that are not built yet as arriving with the next update', async () => {
    window.location.hash = '#/step/pathways';
    render(<App />);
    expect(
      await screen.findByText(/arrives with the next update/i, { selector: 'p' }),
    ).toBeTruthy();
  });
});
