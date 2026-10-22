import { useState } from 'react';
import type { UserValue } from '../project/chemicals';
import { Field, TextField } from '../ui/controls';
import { entryProblem } from '../overrides/model';
import { USER_FIELDS, casProblem } from '../overrides/userChemicals';

/** What the editor starts from: a blank chemical, a copy of a database one, or an existing user chemical. */
export interface UserChemicalDraft {
  name: string;
  cas: string;
  values: Record<string, UserValue>;
}

export interface UserChemicalResult {
  name: string;
  cas?: string;
  values: Record<string, UserValue>;
}

/**
 * Define or edit a chemical of the project. Only the name is required. Each value you enter needs a
 * source note, and a CAS number the database already holds is refused. Nothing is saved until Save.
 */
export function UserChemicalEditor(props: {
  /** The heading and the start of the form. */
  title: string;
  draft: UserChemicalDraft;
  /** Chemicals whose CAS number is taken (the database and the other user chemicals). */
  knownCas: readonly { cas?: string | undefined; name: string }[];
  onSave: (result: UserChemicalResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.draft.name);
  const [cas, setCas] = useState(props.draft.cas);
  const [values, setValues] = useState<Record<string, UserValue>>(props.draft.values);
  const [problems, setProblems] = useState<string[]>([]);

  const setField = (key: string, patch: Partial<UserValue>): void =>
    setValues((v) => {
      const next = { value: '', note: '', ...v[key], ...patch };
      const rest = Object.fromEntries(Object.entries(v).filter(([k]) => k !== key));
      return next.value === '' && next.note === '' ? rest : { ...rest, [key]: next };
    });

  const save = (): void => {
    const found: string[] = [];
    if (name.trim() === '') found.push('Enter a name for the chemical.');
    const casIssue = casProblem(cas, props.knownCas);
    if (casIssue !== null) found.push(casIssue);
    for (const { key, label } of USER_FIELDS) {
      const e = values[key];
      const issue = e === undefined ? null : entryProblem(e);
      if (issue !== null) found.push(`${label}: ${issue}`);
    }
    setProblems(found);
    if (found.length > 0) return;
    const clean = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, { value: v.value.trim(), note: v.note.trim() }]),
    );
    props.onSave({
      name: name.trim(),
      ...(cas.trim() === '' ? {} : { cas: cas.trim() }),
      values: clean,
    });
  };

  return (
    <section className="panel user-chemical-editor" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p className="muted">
        A chemical you define is not an EPA value: every number is your own entry and is reported as
        a user value, with the note you give. Only the name is required; leave a value blank when
        you do not have it, and a screen that needs it will say so.
      </p>
      <div className="fields">
        <TextField label="Name" value={name} onChange={setName} />
        <TextField
          label="CAS number (optional)"
          value={cas}
          onChange={setCas}
          placeholder="e.g. 71-43-2"
        />
      </div>
      {USER_FIELDS.map(({ key, label, unit }) => {
        const entry = values[key];
        return (
          <div key={key} className={entry === undefined ? 'override-row' : 'override-row edited'}>
            <p className="override-title">
              {label} <small>{unit}</small>
            </p>
            <div className="fields">
              <Field
                label={`${label} value`}
                value={entry?.value ?? ''}
                onChange={(v) => setField(key, { value: v })}
              />
              <TextField
                label={`${label} source note (required with a value)`}
                value={entry?.note ?? ''}
                onChange={(v) => setField(key, { note: v })}
              />
            </div>
          </div>
        );
      })}
      {problems.length > 0 && (
        <div className="alert" role="alert">
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <button type="button" className="btn" onClick={save}>
          Save chemical
        </button>{' '}
        <button type="button" className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      </p>
    </section>
  );
}
