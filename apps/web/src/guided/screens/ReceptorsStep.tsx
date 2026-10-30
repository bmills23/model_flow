import { HelpLink } from '../../docs/HelpLink';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { AlertDialog } from '../../ui/AlertDialog';
import { ReceptorPanel } from '../../risk/ReceptorPanel';
import { defaultReceptor, type ReceptorForm } from '../../risk/form';
import { useOverrides } from '../../overrides/useOverrides';
import { getGuided, setGuided, subscribeGuided } from '../../project/store';
import { guidedHref } from '../../steps';
import { childAndAdult, missingExposureInputs, receptorProblems } from '../exposure';
import { pathwayStatuses } from '../pathways';
import type { GuidedState } from '../state';

/**
 * Step 4b, receptors: one or two people exposed, each with a name and a profile (the EPA RSL defaults).
 * An edited factor is marked and shows the profile's value and its source note; the factors the ticked
 * pathways need and the profile leaves open are named here. The pathways are set once, in step 4a.
 */
export function ReceptorsStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const [overrides, setOverrides] = useOverrides();
  const [confirming, setConfirming] = useState(false);
  const factorEdits = ['guided.a', 'guided.b'].reduce(
    (n, k) => n + Object.keys(overrides.receptors[k] ?? {}).length,
    0,
  );
  const exposure = guided.exposure;
  const save = (patch: Partial<GuidedState['exposure']>): void => {
    const g = getGuided();
    setGuided({ ...g, exposure: { ...g.exposure, ...patch } });
  };
  const missing = useMemo(() => missingExposureInputs(guided, overrides), [guided, overrides]);
  const problems = useMemo(() => receptorProblems(guided), [guided]);
  const noPathway = !useMemo(() => pathwayStatuses(guided).some((p) => p.on), [guided]);
  const needs = (which: 'a' | 'b'): boolean => missing.some((m) => m.which === which);
  const methodName = guided.run.basis === 'modern' ? 'modern' : 'legacy';

  return (
    <section aria-labelledby="guided-receptors-heading" className="guided-exposure">
      <h1 id="guided-receptors-heading">Receptors</h1>
      <HelpLink target="step/receptors" />
      <p className="muted">
        Who is exposed. Choose one or two receptors, give each a name if you like, and pick the
        profile that fits. A profile gives EPA RSL default exposure factors; change any of them for
        this site and the edited factor is marked with the profile&apos;s value beside it.
      </p>
      {noPathway ? (
        <p className="guided-exposure-warn" role="status">
          No pathway is ticked yet.{' '}
          <a href={guidedHref('pathways')}>Tick at least one in step 4a</a>.
        </p>
      ) : null}
      <ReceptorPanel
        tag="Receptor A"
        id="a"
        screen="guided"
        form={exposure.a}
        onChange={(a: ReceptorForm) => save({ a })}
        hidePathways
        openSiteFactors={needs('a')}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={exposure.b !== null}
          onChange={(e) =>
            save({
              b: e.target.checked ? defaultReceptor('worker') : null,
              additive: e.target.checked ? exposure.additive : false,
            })
          }
        />
        <span>Evaluate a second receptor</span>
      </label>
      {exposure.b !== null && (
        <ReceptorPanel
          tag="Receptor B"
          id="b"
          screen="guided"
          form={exposure.b}
          onChange={(b: ReceptorForm) => save({ b })}
          hidePathways
          openSiteFactors={needs('b')}
        />
      )}
      {exposure.b !== null && (
        <label className="check">
          <input
            type="checkbox"
            checked={exposure.additive}
            onChange={(e) => save({ additive: e.target.checked })}
          />
          <span>Add the two receptors&apos; cancer risks (never their hazard indices)</span>
        </label>
      )}
      <div className="guided-child-adult">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (factorEdits > 0) setConfirming(true);
            else setGuided(childAndAdult(getGuided()));
          }}
        >
          Use a child and an adult for cancer risk
        </button>
        {confirming && (
          <AlertDialog
            className="alert"
            label="Change both receptors"
            onCancel={() => setConfirming(false)}
          >
            <p>
              <strong>
                The receptors have {factorEdits} edited exposure factor
                {factorEdits === 1 ? '' : 's'}.
              </strong>{' '}
              The edits belong to the profiles they were made on. Using a child and an adult resets
              them to the profiles&apos; values. The receptor names stay.
            </p>
            <div className="u-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setOverrides({
                    ...overrides,
                    receptors: Object.fromEntries(
                      Object.entries(overrides.receptors).filter(
                        ([k]) => k !== 'guided.a' && k !== 'guided.b',
                      ),
                    ),
                  });
                  setGuided(childAndAdult(getGuided()));
                  setConfirming(false);
                }}
              >
                Use them and reset edits
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setConfirming(false)}
              >
                Keep the current receptors
              </button>
            </div>
          </AlertDialog>
        )}
        <p className="muted">
          Sets Receptor A to a child resident and Receptor B to a resident adult, and adds their
          cancer risks.{' '}
          {methodName === 'modern'
            ? 'The modern resident profile already covers a child and then an adult in one receptor, so with the modern method this counts the child stage twice. It suits the legacy method.'
            : 'This suits the legacy method chosen in step 3d.'}
        </p>
      </div>
      {problems.length > 0 ? (
        <div className="alert" role="alert">
          <strong>Fix these entries:</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="guided-missing" aria-label="Exposure inputs still needed">
        <h2>Inputs still needed</h2>
        {missing.length === 0 ? (
          <p className="muted">
            Every ticked pathway has the exposure inputs it needs for the {methodName} method.
          </p>
        ) : (
          <>
            <p className="muted">
              These factors have no value in the profile for the {methodName} method (chosen in step
              3d). Until you enter them under site-specific factors above, the pathways that use
              them are not counted.
            </p>
            <ul>
              {missing.map((m) => (
                <li key={`${m.which}-${m.label}`}>
                  <strong>
                    {m.receptor}: {m.label} ({m.unit})
                  </strong>{' '}
                  is needed for {m.pathways.map((p) => p.toLowerCase()).join(', ')}.
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  );
}
