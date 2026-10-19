import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, TextField } from './controls';
import { REJECTED_ENTRY, scrubRejected, setDecimalComma } from './decimalComma';

afterEach(() => setDecimalComma(false));

function Harness({ onValue }: { onValue: (v: string) => void }) {
  const [v, setV] = useState('2.5');
  return (
    <Field
      label="Depth"
      value={v}
      onChange={(x) => {
        setV(x);
        onValue(x);
      }}
    />
  );
}

describe('Field decimal comma', () => {
  it('leaves entry alone when the setting is off', () => {
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    const input = screen.getByLabelText('Depth') as HTMLInputElement;
    expect(input.value).toBe('2.5');
    fireEvent.change(input, { target: { value: '1,5' } });
    expect(seen).toEqual(['1,5']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a comma and stores a point when the setting is on', () => {
    setDecimalComma(true);
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    const input = screen.getByLabelText('Depth') as HTMLInputElement;
    expect(input.value).toBe('2,5');
    fireEvent.change(input, { target: { value: '1,5' } });
    expect(seen).toEqual(['1.5']);
    expect(input.value).toBe('1,5');
  });

  it('rejects an ambiguous string with a field message and keeps the typed text', () => {
    setDecimalComma(true);
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    const input = screen.getByLabelText('Depth') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.234,5' } });
    expect(input.value).toBe('1.234,5');
    expect(screen.getByRole('alert').textContent).toMatch(/ambiguous/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // the form gets a fixed non-number marker, never the typed text, so nothing is computed
    expect(seen[seen.length - 1]).toBe(REJECTED_ENTRY);
    expect(Number.isNaN(Number(REJECTED_ENTRY))).toBe(true);
    fireEvent.change(input, { target: { value: '1,5' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(seen[seen.length - 1]).toBe('1.5');
  });

  it('still shows the alert after a remount while the form holds the marker', () => {
    setDecimalComma(true);
    render(<Field label="Depth" value={REJECTED_ENTRY} onChange={() => undefined} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(screen.getByRole('alert').textContent).toMatch(/ambiguous/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('scrubs the marker from anything that is saved', () => {
    const saved = scrubRejected({
      a: REJECTED_ENTRY,
      b: ['1.5', REJECTED_ENTRY],
      c: { d: 'x, y' },
    });
    expect(saved).toEqual({ a: '', b: ['1.5', ''], c: { d: 'x, y' } });
    expect(JSON.stringify(saved)).not.toMatch(/ambiguous/i);
  });
});

describe('TextField', () => {
  it('passes text through untouched with decimal comma on', () => {
    setDecimalComma(true);
    const seen: string[] = [];
    function H() {
      const [v, setV] = useState('Vole');
      return (
        <TextField
          label="Name"
          value={v}
          onChange={(x) => {
            setV(x);
            seen.push(x);
          }}
        />
      );
    }
    render(<H />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Vole, meadow. a.b,c' } });
    expect(seen).toEqual(['Vole, meadow. a.b,c']);
    expect(input.value).toBe('Vole, meadow. a.b,c');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
