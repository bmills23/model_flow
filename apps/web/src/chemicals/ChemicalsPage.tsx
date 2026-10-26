import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { HelpLink } from '../docs/HelpLink';
import {
  addChemical,
  getChemicals,
  nextProjectUserId,
  subscribeChemicals,
  updateChemical,
} from '../project/store';
import { isUserChemical } from '../overrides/userChemicals';
import {
  UserChemicalEditor,
  type UserChemicalDraft,
  type UserChemicalResult,
} from './UserChemicalEditor';
import { MAX_PROJECT_CHEMICALS } from './browse';
import { DatabaseBrowser } from './DatabaseBrowser';
import { useBrowseDb } from './load';
import { ProjectList } from './ProjectList';

export interface ChemicalsWorkspaceProps {
  projectIntro: ReactNode;
  browserHeading: string;
  browserIntro?: ReactNode;
}

/** The project list and the database browser with the editor for chemicals the user defines. */
export function ChemicalsWorkspace({
  projectIntro,
  browserHeading,
  browserIntro,
}: ChemicalsWorkspaceProps) {
  const { db, error } = useBrowseDb();
  const project = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  // the chemical being defined or edited: `id` is set when an existing user chemical is edited
  const [editing, setEditing] = useState<{
    id: string | null;
    title: string;
    draft: UserChemicalDraft;
  } | null>(null);

  // CAS numbers already taken: the database's and the other user chemicals' (not the one being edited)
  const knownCas = [
    ...(db?.records ?? []),
    ...project.filter((c) => isUserChemical(c) && c.id !== editing?.id),
  ].map((c) => ({ cas: c.cas, name: c.name }));
  const save = (r: UserChemicalResult): void => {
    if (editing === null) return;
    const entry = {
      id: editing.id ?? nextProjectUserId(),
      name: r.name,
      ...(r.cas === undefined ? {} : { cas: r.cas }),
      values: r.values,
    };
    if (editing.id === null) {
      if (getChemicals().length >= MAX_PROJECT_CHEMICALS) return;
      addChemical(entry);
    } else updateChemical(entry);
    setEditing(null);
  };

  return (
    <div className="chem-lists">
      <ProjectList
        project={project}
        intro={projectIntro}
        canDefine={db !== null}
        editing={editing !== null}
        onDefine={() =>
          setEditing({
            id: null,
            title: 'Define a new chemical',
            draft: { name: '', cas: '', values: {} },
          })
        }
        onEdit={(c) =>
          setEditing({
            id: c.id,
            title: `Edit ${c.name}`,
            draft: { name: c.name, cas: c.cas ?? '', values: { ...c.values } },
          })
        }
      >
        {editing && (
          <UserChemicalEditor
            key={editing.id ?? 'new'}
            title={editing.title}
            draft={editing.draft}
            knownCas={knownCas}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </ProjectList>
      <DatabaseBrowser
        db={db}
        error={error}
        project={project}
        heading={browserHeading}
        intro={browserIntro}
        editing={editing !== null}
        onCopy={(title, draft) => setEditing({ id: null, title, draft })}
      />
    </div>
  );
}

/** Read-only browser over the EPA Regional Screening Level chemical data: every value with its source. */
export function ChemicalsPage() {
  const { db } = useBrowseDb();
  return (
    <section aria-labelledby="chemicals-heading" className="vadose chemicals">
      <h1 id="chemicals-heading">Chemical database</h1>
      <HelpLink target="chemicals" />
      <p className="muted">
        EPA Regional Screening Level chemical data, edition {db?.edition ?? '2024-11'}
        {db ? `, retrieved ${db.retrieved}` : ''}. This EPA list is read only: it shows the values
        the calculations use, each with its source. Search by name or CAS number, open a chemical to
        see its values, and download them as a table.
      </p>
      <ChemicalsWorkspace
        projectIntro="The chemicals of this project. The exposure and risk and the cleanup levels screens take every one of them as a row; the fate screens pick one of them. Add a chemical from the list below, or with a search on those screens, or define one of your own."
        browserHeading="EPA chemical list"
      />
    </section>
  );
}
