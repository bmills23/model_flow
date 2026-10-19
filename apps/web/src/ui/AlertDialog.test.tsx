import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertDialog } from './AlertDialog';

function Harness(props: { disableWhileOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => (setOpen(true), setBusy(!!props.disableWhileOpen))}
      >
        Run
      </button>
      {open && (
        <AlertDialog label="Long run" onCancel={() => setOpen(false)}>
          <p>Takes a while.</p>
          <button type="button" onClick={() => setOpen(false)}>
            Run anyway
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setBusy(false);
            }}
          >
            Cancel
          </button>
        </AlertDialog>
      )}
    </div>
  );
}

describe('AlertDialog focus behaviour', () => {
  it('moves focus into the confirmation when it opens, on the non-destructive choice', () => {
    render(<Harness />);
    const run = screen.getByRole('button', { name: 'Run' });
    run.focus();
    fireEvent.click(run);
    const dialog = screen.getByRole('alertdialog', { name: 'Long run' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('Escape cancels and focus returns to the triggering control', async () => {
    render(<Harness />);
    const run = screen.getByRole('button', { name: 'Run' });
    run.focus();
    fireEvent.click(run);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(run));
  });

  it('closing with a button also returns focus', async () => {
    render(<Harness />);
    const run = screen.getByRole('button', { name: 'Run' });
    run.focus();
    fireEvent.click(run);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(run));
  });

  it('waits for a trigger that is disabled while the run winds down', async () => {
    render(<Harness disableWhileOpen />);
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    run.focus();
    fireEvent.click(run);
    expect(run.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(run));
  });
});
