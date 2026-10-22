import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addChemical, forgetMemory, newProject, removeChemical } from '../project/store';
import { ProjectChemicalSelect } from './ProjectChemicalSelect';

describe('ProjectChemicalSelect', () => {
  beforeEach(() => {
    forgetMemory();
    newProject();
  });
  afterEach(() => {
    forgetMemory();
  });

  it('lists the project chemicals by name under its label and reports the picked id', () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    const onChange = vi.fn();
    render(<ProjectChemicalSelect label="Chemical" value="" onChange={onChange} />);
    const select = screen.getByLabelText('Chemical') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['Not set', 'Benzene', 'Toluene']);
    fireEvent.change(select, { target: { value: '108-88-3' } });
    expect(onChange).toHaveBeenCalledWith('108-88-3');
  });

  it('follows the list as it changes', () => {
    render(<ProjectChemicalSelect label="Chemical" value="" onChange={() => undefined} />);
    act(() => addChemical({ id: '71-43-2', name: 'Benzene' }));
    const select = screen.getByLabelText('Chemical') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', '71-43-2']);
  });

  it('with an empty list says so and links to the chemicals screen', () => {
    render(<ProjectChemicalSelect label="Chemical" value="" onChange={() => undefined} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    const link = screen.getByRole('link', { name: /chemicals screen/i });
    expect(link.getAttribute('href')).toBe('#/chemicals');
  });

  it('keeps showing a saved id that is no longer in the list', () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    removeChemical('71-43-2');
    render(<ProjectChemicalSelect label="Chemical" value="71-43-2" onChange={() => undefined} />);
    const select = screen.getByLabelText('Chemical') as HTMLSelectElement;
    expect(select.value).toBe('71-43-2');
    expect(select.selectedOptions[0]?.text).toMatch(/71-43-2.*not in the project list/i);
    expect(screen.getByRole('link', { name: /chemicals screen/i })).toBeTruthy();
  });

  it('shows the hint beside the control', () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    render(
      <ProjectChemicalSelect
        label="Chemical"
        value=""
        onChange={() => undefined}
        hint="The chemical a sent result is for."
      />,
    );
    expect(screen.getByText('The chemical a sent result is for.')).toBeTruthy();
  });
});
