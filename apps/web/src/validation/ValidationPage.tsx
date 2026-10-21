import validation from '@model-flow/data/generated/validation/validation.json';
import { registry } from '@model-flow/engine';
import { HelpLink } from '../docs/HelpLink';

const methodNames = new Map(registry.list().map((m) => [m.id, m.name]));
const methodLabel = (id: string) => methodNames.get(id) ?? id;

const COLUMNS = ['Example', 'Source', 'Method', 'What is compared', 'Cases', 'Tolerance', 'Status'];

export function ValidationPage() {
  const { examples, unverified } = validation;
  return (
    <section aria-labelledby="validation-heading">
      <h1 id="validation-heading">Validation</h1>
      <HelpLink target="validation" />
      <p className="lede">
        This page lists the published worked examples that the test suite reproduces, and what is
        not verified. It is generated from the test fixtures, so it cannot drift from what the tests
        check.
      </p>
      <h2>What the evidence shows</h2>
      <p>
        Each example below is a published table or program output that the engine reproduces within
        the stated tolerance. That shows the implementation matches the published method on those
        cases. It does not show that a method suits your site. There is no RISC5 licence, so nothing
        is checked against RISC5 outputs; where this app differs from RISC5 the methods page says
        why. Statuses: reproduced, named exception (a published case the engine is known not to
        match, with the reason), pending or deferred, and smoke test only (the code runs and gives
        finite values, but is not compared with a published number).
      </p>
      <h2 id="validation-examples">Worked examples</h2>
      <table className="doc-table" aria-labelledby="validation-examples">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {examples.map((ex) => (
            <tr key={ex.id}>
              <td data-label={COLUMNS[0]}>
                {ex.title} <code>{ex.id}</code>
                {ex.note ? <span className="muted"> {ex.note}</span> : null}
              </td>
              <td data-label={COLUMNS[1]}>{ex.source}</td>
              <td data-label={COLUMNS[2]}>{ex.methodIds.map(methodLabel).join(', ')}</td>
              <td data-label={COLUMNS[3]}>{ex.compares}</td>
              <td data-label={COLUMNS[4]}>
                {ex.cases} {ex.casesUnit}
              </td>
              <td data-label={COLUMNS[5]}>{ex.tolerance}</td>
              <td data-label={COLUMNS[6]}>{ex.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>What is unverified</h2>
      <h3>References a method relies on that are not yet read</h3>
      <ul>
        {unverified.plannedReferences.map((r) => (
          <li key={r.key}>
            {r.title}, relied on by{' '}
            {r.reliedOnBy.map((id) => `${methodLabel(id)} (${id})`).join(', ')}
          </li>
        ))}
      </ul>
      <h3>Other planned references</h3>
      <ul>
        {unverified.otherPlannedReferences.map((r) => (
          <li key={r.key}>{r.title}</li>
        ))}
      </ul>
      <h3>Warned or unverified defaults</h3>
      <ul>
        {unverified.defaults.map((d) => (
          <li key={d.subject}>
            <strong>{d.subject}</strong>. {d.note}
            {d.warningCode ? (
              <>
                {' '}
                Warning code <code>{d.warningCode}</code>.
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <h3>Values not checked</h3>
      <ul>
        {unverified.notChecked.map((n) => (
          <li key={n.subject}>
            <strong>{n.subject}</strong>. {n.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
