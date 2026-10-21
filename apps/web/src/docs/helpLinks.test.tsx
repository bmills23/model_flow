import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { HELP_TARGETS, helpHref } from './help';
import { parseMarkdown, sectionId } from './markdown';

// apps/web/src/docs -> the repository's docs folder
const guide = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'docs', 'USER_GUIDE.md'),
  'utf8',
);
const guideIds = new Set(
  parseMarkdown(guide).flatMap((b) => (b.type === 'heading' ? [sectionId(b.text)] : [])),
);

// Every screen route that carries a help link, and the user guide heading it must reach.
const SCREENS = Object.keys(HELP_TARGETS) as (keyof typeof HELP_TARGETS)[];

afterEach(() => {
  window.location.hash = '';
});

async function openRoute(hash: string) {
  window.location.hash = hash;
  const view = render(<App />);
  const main = await screen.findByRole('main');
  await waitFor(() => expect(main.textContent ?? '').not.toMatch(/^\s*Loading the/), {
    timeout: 20000,
  });
  return { ...view, main };
}

describe('help link targets', () => {
  it('names a user guide heading for every screen, and each heading exists', () => {
    for (const key of SCREENS) {
      const id = sectionId(HELP_TARGETS[key]);
      expect(guideIds.has(id), `${key} -> ${id}`).toBe(true);
    }
  });

  it('builds a reader hash for a section', () => {
    expect(helpHref('chemicals')).toBe(
      `#/docs/user-guide/${sectionId('Chemical database (`#/chemicals`)')}`,
    );
  });
});

describe('help link on every screen', () => {
  for (const key of SCREENS) {
    it(`renders a Help link on ${key} that reaches the user guide section`, async () => {
      const { main } = await openRoute(`#/${key}`);
      const link = screen.getByRole('link', { name: 'Help' });
      expect(main.contains(link)).toBe(true);
      const href = link.getAttribute('href') ?? '';
      const m = /^#\/docs\/user-guide\/([^/?#]+)$/.exec(href);
      expect(m, href).not.toBeNull();
      expect(guideIds.has(m![1]!), href).toBe(true);
    }, 40000);
  }

  it('opens the reader at the section, and the back link returns to the screen', async () => {
    await openRoute('#/chemicals');
    const link = screen.getByRole('link', { name: 'Help' });
    expect(link.getAttribute('href')).toBe(helpHref('chemicals'));
    // jsdom does not follow anchors, so the browser's navigation is applied to the hash directly
    window.location.hash = helpHref('chemicals');
    const heading = await waitFor(
      () => {
        const el = document.getElementById(sectionId(HELP_TARGETS.chemicals));
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 5000 },
    );
    expect(document.activeElement).toBe(heading);
    expect(heading.textContent).toMatch(/Chemical database/);
    window.location.hash = '#/chemicals';
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chemical database' }),
    ).toBeTruthy();
  }, 40000);
});
