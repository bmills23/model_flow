import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBar } from './ProjectBar';
import { buildProject, defaultScreens } from './index';
import { makeShareLink } from './share';
import { getScreen, getTitle, markSaved, setScreen, setTitle } from './store';
import { serializeProject } from './file';

function sharedProject(k: string) {
  const s = defaultScreens();
  s.transport = { ...s.transport, form: { ...s.transport.form, K: k } };
  return buildProject({ screens: s, createdWith: '0.0.0', title: 'Shared' });
}

describe('project bar', () => {
  beforeEach(() => {
    window.location.hash = '';
    markSaved();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('Save project downloads a json file through an anchor and marks the project saved', async () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    render(<ProjectBar />);
    fireEvent.change(screen.getByLabelText(/project title/i), { target: { value: 'Site Z' } });
    fireEvent.click(screen.getByRole('button', { name: /save project/i }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^Site-Z-\d{4}-\d{2}-\d{2}\.json$/);
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toMatch(/saved/i);
  });

  it('Open project reads a chosen file and replaces the project', async () => {
    render(<ProjectBar />);
    const input = screen.getByLabelText(/open project file/i) as HTMLInputElement;
    const file = new File([serializeProject(sharedProject('42'))], 'p.json');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(getScreen('transport').form.K).toBe('42'));
    expect(getTitle()).toBe('Shared');
  });

  it('Open project shows the error and keeps the project when the file is not valid', async () => {
    render(<ProjectBar />);
    const input = screen.getByLabelText(/open project file/i) as HTMLInputElement;
    const before = getScreen('transport').form.K;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['{"a":1}'], 'p.json')] } });
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/not a model_flow project/i),
    );
    expect(getScreen('transport').form.K).toBe(before);
  });

  it('Open project asks first when there are unsaved changes, and keeps the project on cancel', async () => {
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: '11' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProjectBar />);
    const input = screen.getByLabelText(/open project file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([serializeProject(sharedProject('42'))], 'p.json')] },
      });
    });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(getScreen('transport').form.K).toBe('11');
  });

  it('Share link shows the link, or the reason when it is too long', async () => {
    render(<ProjectBar />);
    fireEvent.click(screen.getByRole('button', { name: /share link/i }));
    const box = (await screen.findByLabelText(/share link address/i)) as HTMLInputElement;
    expect(box.value).toMatch(/#\/p=/);
    expect(screen.getByText(/does not include the values passed between screens/i)).toBeTruthy();
    let s = 99;
    let title = '';
    for (let i = 0; i < 12000; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      title += String.fromCharCode(97 + (s % 26));
    }
    setTitle(title);
    fireEvent.click(screen.getByRole('button', { name: /share link/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/8000/));
    expect(screen.queryByLabelText(/share link address/i)).toBeNull();
  });

  it('a shared link in the address loads the project, with no confirm when nothing is unsaved', async () => {
    const r = await makeShareLink(sharedProject('55'), 'https://x.test/');
    if (!r.ok) throw new Error('link');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProjectBar />);
    await act(async () => {
      window.location.hash = new URL(r.link).hash;
    });
    await waitFor(() => expect(getScreen('transport').form.K).toBe('55'));
    expect(confirm).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
    expect(screen.getByRole('status').textContent).toMatch(/values passed between screens/i);
  });

  it('handling a shared link replaces the history entry so Back does not open it again', async () => {
    const r = await makeShareLink(sharedProject('56'), 'https://x.test/');
    if (!r.ok) throw new Error('link');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const replace = vi.spyOn(window.history, 'replaceState');
    render(<ProjectBar />);
    await act(async () => {
      window.location.hash = new URL(r.link).hash;
    });
    await waitFor(() => expect(getScreen('transport').form.K).toBe('56'));
    expect(replace).toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
    // the same payload arriving again (a Back step) must not decode a second time
    setScreen('transport', {
      ...getScreen('transport'),
      form: { ...getScreen('transport').form, K: '9' },
    });
    await act(async () => {
      window.location.hash = new URL(r.link).hash;
    });
    await act(async () => {
      await new Promise((res) => setTimeout(res, 50));
    });
    expect(getScreen('transport').form.K).toBe('9');
  });

  it('a shared link asks before replacing unsaved work and leaves it alone on cancel', async () => {
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: '11' } });
    const r = await makeShareLink(sharedProject('55'), 'https://x.test/');
    if (!r.ok) throw new Error('link');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProjectBar />);
    await act(async () => {
      window.location.hash = new URL(r.link).hash;
    });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(getScreen('transport').form.K).toBe('11');
    expect(window.location.hash).toBe('#/');
  });

  it('a bad shared link shows an error and changes nothing', async () => {
    render(<ProjectBar />);
    await act(async () => {
      window.location.hash = '#/p=AAAA';
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/shared link/i));
  });

  it('a project file dropped on the page opens like the file input', async () => {
    render(<ProjectBar />);
    const file = new File([serializeProject(sharedProject('64'))], 'p.json');
    await act(async () => {
      fireEvent.drop(window, { dataTransfer: { files: [file], types: ['Files'] } });
    });
    await waitFor(() => expect(getScreen('transport').form.K).toBe('64'));
  });
});
