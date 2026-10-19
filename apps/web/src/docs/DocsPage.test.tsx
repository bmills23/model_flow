import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { docHash, docs, resolveLink, slugFromHash } from './catalog';
import { DocsPage } from './DocsPage';

afterEach(() => {
  window.location.hash = '';
});

describe('docs catalog', () => {
  it('offers the user guide, every methods note and the attributions', () => {
    const slugs = docs.map((d) => d.slug);
    expect(slugs).toContain('user-guide');
    expect(slugs).toContain('attributions');
    expect(slugs).toContain('uncertainty');
    expect(docs.filter((d) => d.group === 'Methods notes').length).toBeGreaterThanOrEqual(13);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('maps hashes to slugs and links to reader links', () => {
    expect(slugFromHash('#/docs')).toBeNull();
    expect(slugFromHash('#/docs/user-guide')).toBe('user-guide');
    expect(docHash('uncertainty')).toBe('#/docs/uncertainty');
    expect(resolveLink('https://example.org/x').kind).toBe('external');
    expect(resolveLink('methods/uncertainty.md#x')).toEqual({
      kind: 'doc',
      href: '#/docs/uncertainty',
    });
    expect(resolveLink('missing.md').kind).toBe('none');
    expect(resolveLink('javascript:alert(1)').kind).toBe('none');
  });
});

describe('DocsPage', () => {
  it('lists the documents as links on the index', () => {
    render(<DocsPage slug={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Documentation' })).toBeTruthy();
    const guide = screen.getByRole('link', { name: /User guide/ });
    expect(guide.getAttribute('href')).toBe('#/docs/user-guide');
  });

  it('renders the user guide with a heading for every screen', async () => {
    render(<DocsPage slug="user-guide" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'User guide' })).toBeTruthy();
    for (const name of [
      'Groundwater transport (#/transport)',
      'Vadose leaching (#/vadose)',
      'Saturated soil source (#/saturated)',
      'Vapor intrusion (#/vapor)',
      'Surface water and sediment (#/surface-water)',
      'Shower, irrigation and particulates (#/household)',
      'Plants, ecology and TPH (#/plants-eco)',
      'Exposure and risk (#/risk)',
      'Cleanup levels (#/cleanup)',
      'Report (#/report)',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
  });

  it('renders a methods note table as a table and never injects markup', async () => {
    render(<DocsPage slug="uncertainty" />);
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelectorAll('main table, table').length).toBeGreaterThan(0);
    expect(document.querySelector('script')).toBeNull();
  });

  it('says so for an unknown document', () => {
    render(<DocsPage slug="nope" />);
    expect(screen.getByText(/no document called/i)).toBeTruthy();
  });
});

describe('committed documents', () => {
  it('parse without leaving raw Markdown marks in paragraphs', async () => {
    const { parseMarkdown } = await import('./markdown');
    for (const d of docs) {
      const blocks = parseMarkdown(await d.load());
      expect(blocks.length, d.slug).toBeGreaterThan(0);
      for (const b of blocks) {
        if (b.type !== 'paragraph') continue;
        expect(b.text, `${d.slug}: ${b.text.slice(0, 60)}`).not.toMatch(/^(\||```|#{1,6}\s|[-*]\s|\d+\.\s)/);
      }
    }
  });
});
