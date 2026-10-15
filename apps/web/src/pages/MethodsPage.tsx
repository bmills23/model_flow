import { formatReference, references, registry, type MethodKind } from '@model-flow/engine';
import { groupByProcess } from './group';

const KIND_LABEL: Record<MethodKind, string> = {
  legacy: 'Legacy (RISC5 default)',
  modern: 'Modern',
};

const byKey = new Map(references.map((r) => [r.key, r]));

export function MethodsPage() {
  const groups = groupByProcess(registry.list());
  return (
    <section aria-labelledby="methods-heading">
      <h1 id="methods-heading">Methods &amp; References</h1>
      <p className="lede">
        Each process offers a legacy method (what RISC5 does) and a modern alternative. Every method
        lists the sources it is implemented from.
      </p>
      {groups.map((group) => (
        <section key={group.process} className="process" aria-label={group.process}>
          <h2>{group.process}</h2>
          {group.methods.map((m) => (
            <article key={m.id} className="method">
              <h3>{m.name}</h3>
              <p>
                <span className={`badge badge-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
              </p>
              <p>{m.summary}</p>
              {m.assumptions.length > 0 && (
                <>
                  <h4>Assumptions</h4>
                  <ul>
                    {m.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
              {m.risc5Choice && (
                <>
                  <h4>RISC5 choice</h4>
                  <p>{m.risc5Choice}</p>
                </>
              )}
              <h4>Sources</h4>
              <ul className="citations">
                {m.citations.map((key) => {
                  const ref = byKey.get(key);
                  return (
                    <li key={key}>{ref ? formatReference(ref) : `Unknown reference ${key}`}</li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      ))}
    </section>
  );
}
