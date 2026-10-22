import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed } from '../vadose/feed';
import { forgetMemory, newProject } from '../project/store';
import { TransportPage } from './TransportPage';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => clearVadoseFeed());

const radio = (name: RegExp): HTMLInputElement =>
  screen.getByRole('radio', { name }) as HTMLInputElement;

describe('TransportPage dispersivity choice', () => {
  it('starts a new project on an entered value and asks for all three numbers', async () => {
    render(<TransportPage />);
    expect(radio(/^entered value/i).checked).toBe(true);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/longitudinal dispersivity is required/i);
    expect(alert.textContent).toMatch(/transverse dispersivity is required/i);
    expect(alert.textContent).toMatch(/vertical dispersivity is required/i);
    expect(screen.queryByRole('img', { name: /plume map/i })).toBeNull();
    expect((screen.getByLabelText(/^longitudinal dispersivity/i) as HTMLInputElement).value).toBe(
      '',
    );
  }, 20000);

  it('computes with entered values and carries no regression warning', async () => {
    render(<TransportPage />);
    fireEvent.change(screen.getByLabelText(/^longitudinal dispersivity/i), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText(/^transverse dispersivity/i), {
      target: { value: '0.5' },
    });
    fireEvent.change(screen.getByLabelText(/^vertical dispersivity/i), {
      target: { value: '0.05' },
    });
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const used = screen.getByLabelText(/dispersivity used/i);
    expect(used.textContent).toMatch(/Longitudinal4(\.0+)? m/);
    expect(screen.queryByText('dispersivity.regression-unsourced')).toBeNull();
  }, 40000);

  it('labels the regression as having no primary source and warns when it is used', async () => {
    render(<TransportPage />);
    fireEvent.click(radio(/RISC5 regression \(no primary source\)/i));
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const warnings = screen.getByRole('region', { name: /warnings/i });
    await within(warnings).findByText('dispersivity.regression-unsourced');
  }, 40000);

  it('offers the SSG rule for the longitudinal value and still asks for the other two', async () => {
    render(<TransportPage />);
    fireEvent.click(radio(/^EPA SSG 1996 rule/i));
    expect(screen.queryByLabelText(/^longitudinal dispersivity/i)).toBeNull();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/longitudinal dispersivity is required/i);
    expect(alert.textContent).toMatch(/transverse dispersivity is required/i);
    expect(screen.getByText(/0\.1\s+times the distance to the receptor/i)).toBeTruthy();
  }, 20000);
});
