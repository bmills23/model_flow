import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VaporPage } from './VaporPage';

describe('VaporPage', () => {
  it('opens on the Table R-3 case with both methods and the published check', () => {
    render(<VaporPage />);
    expect(screen.getByRole('heading', { level: 1, name: /vapor intrusion/i })).toBeTruthy();
    const cmp = screen.getByRole('region', { name: /method comparison/i });
    expect(within(cmp).getByText(/legacy/i)).toBeTruthy();
    expect(within(cmp).getByText(/modern/i)).toBeTruthy();
    const check = screen.getByRole('region', { name: /published value/i });
    expect(within(check).getAllByText(/8\.57/).length).toBeGreaterThan(0);
    expect(within(check).getByText(/within/i)).toBeTruthy();
  });

  it('lists the warnings of both methods', () => {
    render(<VaporPage />);
    const w = screen.getByRole('region', { name: /warnings/i });
    expect(within(w).getByText(/vapor\.soil-source-not-recommended/)).toBeTruthy();
  });

  it('drops the published check once an input changes', () => {
    render(<VaporPage />);
    fireEvent.change(screen.getByLabelText(/^chemical in the soil/i), { target: { value: '500' } });
    expect(screen.queryByRole('region', { name: /published value/i })).toBeNull();
    expect(screen.getByText(/inputs differ from the table r-3 case/i)).toBeTruthy();
  });

  it('shows an alert listing bad inputs and keeps the last result', () => {
    render(<VaporPage />);
    fireEvent.change(screen.getByLabelText(/^floor area/i), { target: { value: 'x' } });
    expect(screen.getByRole('alert').textContent).toMatch(/floor area/i);
    expect(screen.getByRole('region', { name: /method comparison/i })).toBeTruthy();
  });

  it('switches the shown method and the source kind', () => {
    render(<VaporPage />);
    fireEvent.click(screen.getByLabelText(/modern epa/i));
    expect(screen.getByRole('region', { name: /modern epa details/i })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^groundwater$/i));
    expect(screen.getByLabelText(/^groundwater concentration/i)).toBeTruthy();
  });

  it('offers the results as a CSV download', () => {
    render(<VaporPage />);
    expect(screen.getByRole('button', { name: /download csv/i })).toBeTruthy();
  });
});
