import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from './controls';
import { setDecimalComma } from './decimalComma';

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
    // the invalid text never reaches the form as a number: it is NaN downstream
    expect(Number.isNaN(Number(seen[seen.length - 1]))).toBe(true);
    fireEvent.change(input, { target: { value: '1,5' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(seen[seen.length - 1]).toBe('1.5');
  });
});
