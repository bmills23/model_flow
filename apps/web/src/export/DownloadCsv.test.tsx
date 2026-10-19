import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import { CURRENT_EDITIONS } from '../report/methodsRun';
import { DownloadCsv } from './DownloadCsv';

afterEach(() => vi.restoreAllMocks());

describe('DownloadCsv', () => {
  const table = (name: string) => ({
    name,
    label: name,
    rows: [{ a: 1 }],
    columns: [{ key: 'a', header: 'a', unit: 'm' }],
  });

  it('renders nothing without tables', () => {
    const { container } = render(<DownloadCsv tables={[]} />);
    expect(container.textContent).toBe('');
  });

  it('labels a single table plainly and several by name', () => {
    const { rerender } = render(<DownloadCsv tables={[table('one')]} />);
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
    rerender(<DownloadCsv tables={[table('one'), table('two')]} />);
    expect(screen.getByRole('button', { name: 'Download CSV: two' })).toBeTruthy();
  });

  it('downloads the table as a .csv file', async () => {
    const urls: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      urls.push(b);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    render(<DownloadCsv tables={[table('demo')]} />);
    fireEvent.click(screen.getByRole('button'));
    expect(names).toHaveLength(1);
    expect(names[0]!.startsWith(`demo-v${pkg.version}-`)).toBe(true);
    expect(names[0]).toMatch(/-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await urls[0]!.text()).toBe('a (m)\r\n1\r\n');
  });

  it('puts the data edition in the name of a table that reads a dataset', () => {
    const names: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    render(<DownloadCsv tables={[{ ...table('risk-results'), editions: ['rsl'] }]} />);
    fireEvent.click(screen.getByRole('button'));
    expect(names[0]).toContain(`-${CURRENT_EDITIONS.rsl}-`);
  });

  it('can be disabled', () => {
    render(<DownloadCsv tables={[table('x')]} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
