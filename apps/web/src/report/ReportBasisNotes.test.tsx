import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, type Screens } from '../project';
import { buildReport } from './buildReport';
import type { BasisRow, ProjectBasis } from './basis';
import { ReportView } from './ReportPage';

const NOW = new Date('2026-10-22T12:00:00.000Z');

function report() {
  const screens = defaultScreens();
  screens.vadose = {
    ...screens.vadose,
    form: { ...screens.vadose.form, foc: '0.0123' },
  } as Screens['vadose'];
  return buildReport(buildProject({ screens, createdWith: '0.1.0', now: NOW }));
}

const row = (via: BasisRow['via']): BasisRow => ({
  kind: 'entered-unsourced',
  subject: 'Koc',
  value: '5 mL/g',
  detail: 'entered by hand, no database chemical',
  note: 'no note',
  referenceKey: null,
  referenceStatus: null,
  defaultId: null,
  via,
  stale: false,
});

describe('report run basis states', () => {
  it('says the basis is still being built while it is null', () => {
    render(<ReportView report={report()} preparedBy="" />);
    expect(screen.getByText(/run basis is still being built/i)).toBeTruthy();
    expect(screen.queryByText(/could not be built/i)).toBeNull();
  });

  it('says the basis could not be built when loading failed', () => {
    render(<ReportView report={report()} preparedBy="" basisFailed />);
    const alert = screen.getByText(/could not be built/i).closest('p')!;
    expect(alert.textContent).toMatch(/could not be built/i);
    expect(alert.textContent).toMatch(/run basis CSV/i);
    expect(screen.queryByText(/still being built/i)).toBeNull();
  });

  it('prints neither note once the basis is built', () => {
    const basis: ProjectBasis = { sections: { vadose: [] }, project: [] };
    render(<ReportView report={report()} preparedBy="" basis={basis} />);
    expect(screen.queryByText(/could not be built/i)).toBeNull();
    expect(screen.queryByText(/still being built/i)).toBeNull();
  });

  it('warns that rows inherited from the vadose or saturated screen cover one chemical', () => {
    const basis: ProjectBasis = { sections: { vadose: [row('saturated')] }, project: [] };
    render(<ReportView report={report()} preparedBy="" basis={basis} />);
    const note = screen.getByText(/only the chemical currently selected/i);
    expect(note.textContent).toMatch(/multi-chemical/i);
  });

  it('prints no such warning when no row comes from those screens', () => {
    const basis: ProjectBasis = {
      sections: { vadose: [row(null), row('transport')] },
      project: [],
    };
    render(<ReportView report={report()} preparedBy="" basis={basis} />);
    expect(screen.queryByText(/only the chemical currently selected/i)).toBeNull();
  });
});
