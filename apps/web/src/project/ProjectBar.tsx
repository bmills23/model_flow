import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { downloadProject, readProjectFile } from './file';
import type { LoadResult } from './index';
import { SHARE_PREFIX, decodeShare, makeShareLink } from './share';
import {
  currentProject,
  getTitle,
  hasUnsavedChanges,
  loadProject,
  markSaved,
  setTitle,
  subscribeProject,
} from './store';

const SHARED_NOTE =
  'The shared link does not include the values passed between screens. Send them again from their source screens (groundwater transport, vadose leaching, saturated soil source, vapor intrusion, surface water and sediment).';
const SHARE_CAVEAT =
  'The link holds every screen as entered but does not include the values passed between screens; the person who opens it sends those again from their source screens.';
const REPLACE_PROMPT =
  'Replace the current project? It has changes that are not saved to a file. Use Cancel, then Save project, to keep them.';

type Message = { kind: 'status' | 'error'; text: string } | null;

/** Save, open and share the project: the file is the durable store, the link is a convenience. */
export function ProjectBar() {
  const title = useSyncExternalStore(subscribeProject, getTitle, getTitle);
  const [message, setMessage] = useState<Message>(null);
  const [link, setLink] = useState<string | null>(null);
  const lastPayload = useRef<string | null>(null);

  const replaceWith = (r: LoadResult, done: string): boolean => {
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.error });
      return false;
    }
    if (hasUnsavedChanges() && !window.confirm(REPLACE_PROMPT)) return false;
    loadProject(r.project);
    setLink(null);
    const warn = r.warnings.length > 0 ? ` ${r.warnings.map((w) => w.message).join(' ')}` : '';
    setMessage({ kind: 'status', text: `${done}${warn}` });
    return true;
  };

  const openFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    replaceWith(await readProjectFile(file), `Opened ${file.name}.`);
  };

  useEffect(() => {
    const check = (): void => {
      const prefix = `#${SHARE_PREFIX}`;
      const hash = window.location.hash;
      if (!hash.startsWith(prefix)) return;
      const payload = hash.slice(prefix.length);
      if (lastPayload.current === payload) return;
      lastPayload.current = payload;
      void decodeShare(payload).then((r) => {
        if (!r.ok) {
          setMessage({ kind: 'error', text: r.error });
        } else {
          replaceWith(r, `Opened the shared project. ${SHARED_NOTE}`);
        }
        // leave the hash so a reload or a back step does not open the link again
        window.location.hash = '#/';
        lastPayload.current = null;
      });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // replaceWith only touches state setters and the store
  }, []);

  useEffect(() => {
    const over = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent): void => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      void openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = (): void => {
    const name = downloadProject(currentProject());
    markSaved();
    setLink(null);
    setMessage({ kind: 'status', text: `Saved ${name}.` });
  };

  const onShare = async (): Promise<void> => {
    const base = window.location.href.replace(/#.*$/, '');
    const r = await makeShareLink(currentProject(), base);
    if (r.ok) {
      setLink(r.link);
      setMessage(null);
    } else {
      setLink(null);
      setMessage({ kind: 'error', text: r.error });
    }
  };

  const onCopy = async (): Promise<void> => {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ kind: 'status', text: 'Link copied.' });
    } catch {
      setMessage({ kind: 'status', text: 'Select the link and copy it.' });
    }
  };

  return (
    <section className="project-bar" aria-label="Project file">
      <label className="project-title">
        <span>Project title</span>
        <input
          type="text"
          value={title}
          maxLength={120}
          autoComplete="off"
          placeholder="Untitled project"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="project-actions">
        <button type="button" className="btn" onClick={onSave}>
          Save project
        </button>
        <label className="btn project-open">
          Open project
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Open project file"
            onChange={(e) => {
              const input = e.currentTarget;
              void openFile(input.files?.[0]).then(() => {
                input.value = '';
              });
            }}
          />
        </label>
        <button type="button" className="btn" onClick={() => void onShare()}>
          Share link
        </button>
      </div>
      {link !== null ? (
        <div className="project-share">
          <label>
            <span>Share link address</span>
            <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="btn" onClick={() => void onCopy()}>
            Copy link
          </button>
          <p className="muted">{SHARE_CAVEAT}</p>
        </div>
      ) : null}
      {message?.kind === 'status' ? (
        <p className="project-message" role="status">
          {message.text}
        </p>
      ) : null}
      {message?.kind === 'error' ? (
        <p className="project-message project-error" role="alert">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
