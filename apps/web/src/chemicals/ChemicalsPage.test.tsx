import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import chemicalsJson from '@model-flow/data/generated/rsl-2024-11/chemicals.json';
import toxJson from '@model-flow/data/generated/rsl-2024-11/tox.json';
import type { ChemicalsFile, ToxFile } from '@model-flow/data/rsl-types';
import { ChemicalsPage } from './ChemicalsPage';

const full = chemicalsJson as unknown as ChemicalsFile;
const tox = toxJson as unknown as ToxFile;

async function loaded() {
  render(<ChemicalsPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

describe('ChemicalsPage', () => {
  it('shows the data edition and the read-only note', async () => {
    await loaded();
    expect(screen.getByText(/2024-11/)).toBeTruthy();
    expect(screen.getByText(/read only/i)).toBeTruthy();
  }, 30000);

  it('filters by name and by CAS number and says how many match', async () => {
    await loaded();
    const box = screen.getByLabelText(/search/i);
    fireEvent.change(box, { target: { value: '71-43-2' } });
    expect(await screen.findByText(/^Benzene \(71-43-2\)$/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'zzzz-nothing' } });
    expect(screen.getByRole('status').textContent).toMatch(/no chemical matches/i);
  }, 30000);

  it('shows each value of a record as the data file has it, with its source, in a captioned table', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '71-43-2' } });
    const summary = await screen.findByText(/^Benzene \(71-43-2\)$/);
    const details = summary.closest('details')!;
    fireEvent.click(summary);
    const table = within(details).getByRole('table');
    expect(table.querySelector('caption')?.textContent).toMatch(/benzene/i);
    for (const th of Array.from(table.querySelectorAll('thead th'))) {
      expect(th.getAttribute('scope')).toBe('col');
    }
    const src = full.chemicals.find((c) => c.cas === '71-43-2')!;
    const t = tox.toxicity.find((x) => x.cas === '71-43-2')!;
    const cells = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => c.textContent),
    );
    const row = (label: RegExp) => cells.find((r) => label.test(r[0] ?? ''));
    expect(row(/^Molecular weight/)).toEqual([
      'Molecular weight',
      String(src.values.mw!.value),
      'g/mol',
      src.values.mw!.ref,
    ]);
    expect(row(/^Oral slope factor/)?.[1]).toBe(String(t.sfo!.value));
    expect(row(/^Oral slope factor/)?.[3]).toBe(tox.sourceKeys[t.sfo!.source]);
  }, 30000);

  it('offers a CSV download of the filtered rows', async () => {
    await loaded();
    expect(screen.getByRole('button', { name: /^download csv$/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'toluene' } });
    expect(
      await screen.findByRole('button', { name: /download csv: matching chemicals/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /download csv: all chemicals/i })).toBeTruthy();
  }, 30000);
});
