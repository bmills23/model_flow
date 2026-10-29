import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { currentProject, forgetMemory, getScreen, loadProject, setScreen } from './project/store';
import { clearWellFeed, setWellFeed } from './transport/wellFeed';
import { HOME_LINKS, MIN_TEXT, shellProblems } from '../../../scripts/shell-verdict.mjs';

/** Renders the app on the workbench page, where the model screens are listed. */
const renderWorkbench = (): void => {
  window.location.hash = '#/workbench';
  render(<App />);
};

describe('App shell', () => {
  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  it('shows the six RISC-style steps in the navigation', () => {
    render(<App />);
    const nav = screen.getByRole('navigation');
    for (const label of [
      'Chemicals',
      'Site model',
      'Site values and run',
      'Pathways and receptors',
      'Risk or cleanup',
      'Results',
    ]) {
      expect(nav.textContent).toContain(label);
    }
  });

  it('carries the non-affiliation notice in the footer', () => {
    render(<App />);
    expect(screen.getByRole('contentinfo').textContent).toMatch(/not affiliated/i);
  });

  it('lists the Methods & References page on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /methods and references/i }))[0]!;
    expect(link.getAttribute('href')).toBe('#/methods');
  });

  it('lists the vadose leaching screen on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /vadose leaching/i }))[0]!;
    expect(link.getAttribute('href')).toBe('#/vadose');
  });

  it('lists the saturated soil source screen on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /saturated soil source/i }))[0]!;
    expect(link.getAttribute('href')).toBe('#/saturated');
  });

  it('lists the exposure and risk screen on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /exposure and risk/i }))[0]!;
    expect(link.getAttribute('href')).toBe('#/risk');
  });

  it('lists the household screen on the workbench', async () => {
    renderWorkbench();
    const link = (
      await screen.findAllByRole('link', { name: /shower, irrigation and particulates/i })
    )[0]!;
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

  it('opens the plants, ecology and TPH screen at #/plants-eco', async () => {
    window.location.hash = '#/plants-eco';
    render(<App />);
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: /plants, ecology and tph/i },
        { timeout: 20000 },
      ),
    ).toBeTruthy();
    window.location.hash = '';
  }, 30000);

  it('lists the cleanup levels screen on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /cleanup levels/i }))[0]!;
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

  it('renders the vapor screen on its route', async () => {
    window.location.hash = '#/vapor';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /vapor intrusion/i })).toBeTruthy();
    window.location.hash = '';
  });

  it('lists the surface water screen on the workbench', async () => {
    renderWorkbench();
    const link = (await screen.findAllByRole('link', { name: /surface water and sediment/i }))[0]!;
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

  it('links to the report from the navigation and opens it at #/report', async () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Report' }).getAttribute('href')).toBe('#/report');
    cleanup();
    window.location.hash = '#/report';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Report' })).toBeTruthy();
  });

  it("prints today's report at #/workbench/report", async () => {
    window.location.hash = '#/workbench/report';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Report' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/guided steps/i);
    expect(screen.getByRole('link', { name: /model workbench/i })).toBeTruthy();
  });

  it('links to the documentation and opens the reader at #/docs and #/docs/user-guide', async () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Documentation' }).getAttribute('href')).toBe('#/docs');
    cleanup();
    window.location.hash = '#/docs/user-guide';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'User guide' })).toBeTruthy();
  });

  it('lists the six steps in the navigation, each linked to a guided step, with no disabled one', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const steps = nav.querySelectorAll('ol.steps li');
    expect(steps).toHaveLength(6);
    expect(nav.querySelectorAll('.steps button')).toHaveLength(0);
    const hrefs = [...steps].map((li) => li.querySelector('a')?.getAttribute('href'));
    expect(hrefs).toEqual([
      '#/step/chemicals',
      '#/step/site',
      '#/step/properties',
      '#/step/pathways',
      '#/step/targets',
      '#/step/results',
    ]);
  });

  it('keeps the model screens out of the main navigation and links the workbench instead', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('a[href="#/vadose"]')).toBeNull();
    expect(nav.querySelector('a[href="#/risk"]')).toBeNull();
    expect(nav.querySelector('a[href="#/workbench"]')?.textContent).toMatch(/model workbench/i);
  });

  it('lists every old model route on the workbench', () => {
    renderWorkbench();
    expect(screen.getByRole('heading', { level: 1, name: 'Model workbench' })).toBeTruthy();
    const main = document.getElementById('main')!;
    for (const h of [
      '#/transport',
      '#/vadose',
      '#/saturated',
      '#/vapor',
      '#/surface-water',
      '#/household',
      '#/plants-eco',
      '#/risk',
      '#/cleanup',
      '#/workbench/report',
      '#/validation',
      '#/methods',
    ]) {
      expect(main.querySelector(`a[href="${h}"]`), h).toBeTruthy();
    }
  });

  it.each([
    ['#/site', '#/step/site'],
    ['#/chemicals', '#/step/chemicals'],
  ])('sends %s to %s', async (from, to) => {
    window.location.hash = from;
    render(<App />);
    expect(await screen.findByRole('navigation', { name: /guided steps/i })).toBeTruthy();
    expect(window.location.hash).toBe(to);
  });

  it('marks only the step that owns the current route', () => {
    window.location.hash = '#/step/run';
    render(<App />);
    const current = screen
      .getByRole('navigation', { name: 'Main' })
      .querySelectorAll('ol.steps a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain('Site values and run');
  });

  it('marks no step on the home page, which leads into step 1 and passes the shell rule', () => {
    window.location.hash = '';
    render(<App />);
    expect(document.querySelectorAll('ol.steps a[aria-current]')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/placeholder/i);
    const main = document.getElementById('main')!;
    expect(main.querySelector('a[href="#/step/chemicals"]')).toBeTruthy();
    expect(main.querySelector('a[href="#/workbench"]')).toBeTruthy();
    expect(main.querySelector('a[href="#/report"]')).toBeTruthy();
    expect(main.querySelectorAll('a[href]').length).toBeGreaterThanOrEqual(HOME_LINKS);
    expect((main.textContent ?? '').trim().length).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(
      shellProblems({
        navMain: document.querySelectorAll('nav[aria-label="Main"]').length,
        mains: document.querySelectorAll('main#main').length,
        mainH1: main.querySelectorAll('h1').length,
        links: main.querySelectorAll('a[href]').length,
        controls: main.querySelectorAll('input, select, textarea').length,
        tables: main.querySelectorAll('table').length,
        charts: main.querySelectorAll('svg').length,
        textLen: (main.textContent ?? '').trim().length,
      }),
    ).toEqual([]);
  });

  it('carries no interim wording about steps arriving later', () => {
    render(<App />);
    expect(document.body.textContent).not.toMatch(/next update|arrives with|being built/i);
  });
});

describe('stale values banner', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      clearWellFeed();
      forgetMemory();
    });
    window.location.hash = '';
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
    renderWorkbench();
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

  it.each(['', '#/step/run', '#/report', '#/docs'])('does not show on %s', (hash) => {
    window.location.hash = hash;
    render(<App />);
    act(() => setWellFeed(well));
    editK('99');
    expect(screen.queryByText(note)).toBeNull();
  });

  it.each(['#/workbench', '#/workbench/report', '#/transport', '#/risk', '#/methods'])(
    'shows on %s',
    (hash) => {
      window.location.hash = hash;
      render(<App />);
      act(() => setWellFeed(well));
      editK('99');
      expect(screen.getByText(note)).toBeTruthy();
    },
  );

  it('stays dismissed for the same stale feed and comes back for a later one', () => {
    renderWorkbench();
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
    renderWorkbench();
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

  it('links to step 1 from the home page', () => {
    window.location.hash = '';
    render(<App />);
    const link = screen.getByRole('link', { name: /start the guided flow/i });
    expect(link.getAttribute('href')).toBe('#/step/chemicals');
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
});
