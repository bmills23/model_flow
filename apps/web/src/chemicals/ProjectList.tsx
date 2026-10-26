import { useState, type ReactNode } from 'react';
import type { ProjectChemical } from '../project/chemicals';
import { removeProjectChemical } from '../project/store';
import { isUserChemical } from '../overrides/userChemicals';
import { RemoveChemicalConfirm } from '../project/RemoveChemicalConfirm';
import { MAX_PROJECT_CHEMICALS } from './browse';

export interface ProjectListProps {
  project: readonly ProjectChemical[];
  /** Explains what the list is for; the page and the guided step word it differently. */
  intro: ReactNode;
  /** The define and edit buttons are off while the database is loading or an editor is open. */
  canDefine: boolean;
  editing: boolean;
  onDefine: () => void;
  onEdit: (c: ProjectChemical) => void;
  /** The editor form, shown under the list. */
  children?: ReactNode;
}

/** The chemicals of the project: count against the cap, Define, Edit (own chemicals) and Remove with a confirmation. */
export function ProjectList({
  project,
  intro,
  canDefine,
  editing,
  onDefine,
  onEdit,
  children,
}: ProjectListProps) {
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const full = project.length >= MAX_PROJECT_CHEMICALS;
  return (
    <section className="panel project-chemicals" aria-labelledby="project-chemicals-heading">
      <h2 id="project-chemicals-heading">Project chemicals</h2>
      <p className="muted">{intro}</p>
      <p className="muted" data-testid="project-count">
        {project.length} of {MAX_PROJECT_CHEMICALS} chemicals.
        {full ? ' The project is full: remove a chemical to add another.' : ''}
      </p>
      <p>
        <button
          type="button"
          className="btn"
          disabled={!canDefine || editing || full}
          onClick={onDefine}
        >
          Define a new chemical
        </button>
      </p>
      {project.length === 0 ? (
        <p className="muted">
          No chemicals in the project yet. Search below and choose Add to project.
        </p>
      ) : (
        <ul className="chem-list">
          {project.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span> {c.name !== c.id && <span className="muted">({c.id})</span>}{' '}
              {isUserChemical(c) && <span className="muted">defined by you </span>}
              {isUserChemical(c) && (
                <button
                  type="button"
                  className="btn"
                  aria-label={`Edit ${c.name}`}
                  disabled={editing}
                  onClick={() => onEdit(c)}
                >
                  Edit
                </button>
              )}{' '}
              <button
                type="button"
                className="btn remove"
                aria-label={`Remove ${c.name}`}
                onClick={() => setRemoving({ id: c.id, name: c.name })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {children}
      {removing && (
        <RemoveChemicalConfirm
          id={removing.id}
          name={removing.name}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            removeProjectChemical(removing.id);
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
