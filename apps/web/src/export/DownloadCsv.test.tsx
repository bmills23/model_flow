import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(names).toEqual(['demo.csv']);
    expect(await urls[0]!.text()).toBe('a (m)\r\n1\r\n');
  });

  it('can be disabled', () => {
    render(<DownloadCsv tables={[table('x')]} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
