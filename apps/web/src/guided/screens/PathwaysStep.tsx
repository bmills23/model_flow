import { HelpLink } from '../../docs/HelpLink';
import { useMemo, useSyncExternalStore } from 'react';
import { getGuided, setGuided, subscribeGuided } from '../../project/store';
import { guidedHref } from '../../steps';
import { chain } from '../chain';
import { setPathwayTick } from '../exposure';
import { pathwayStatuses } from '../pathways';

/**
 * Step 4a, pathways: the ways a person is exposed. Each starts ticked when the site model (step 2) gives
 * it a concentration, and one the site model rules out is shown disabled with the reason. Only the ticks
 * the user changed are saved, so a pathway the site model later allows starts ticked again.
 */
export function PathwaysStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const statuses = useMemo(() => pathwayStatuses(guided), [guided]);
  const problems = useMemo(() => chain(guided.site).problems, [guided.site]);
  const ticked = statuses.filter((s) => s.on).length;
  const available = statuses.filter((s) => s.available).length;
  const ecological = guided.site.receptors === 'ecological';

  return (
    <section aria-labelledby="guided-pathways-heading" className="guided-exposure">
      <h1 id="guided-pathways-heading">Pathways</h1>
      <HelpLink target="step/pathways" />
      <p className="muted">
        The ways a person can come into contact with the contamination. Each pathway the site model
        gives a concentration is ticked to start with; untick the ones you do not want to count. A
        pathway the site model rules out is shown dimmed with the reason, and the{' '}
        <a href={guidedHref('site')}>site model (step 2)</a> is where to change it.
      </p>
      {problems.length > 0 && !ecological ? (
        <div className="alert" role="alert">
          <strong>Step 2 needs attention before pathways can be offered.</strong>{' '}
          <a href={guidedHref('site')}>Open the site model</a>.
        </div>
      ) : null}
      <fieldset className="guided-pathway-list">
        <legend>Pathways to include</legend>
        <ul>
          {statuses.map((s) => {
            const reasonId = `guided-pathway-${s.id}-reason`;
            return (
              <li key={s.id} className={s.available ? undefined : 'guided-pathway-off'}>
                <label className="guided-site-check">
                  <input
                    type="checkbox"
                    checked={s.on}
                    disabled={!s.available}
                    aria-describedby={s.reason === null ? undefined : reasonId}
                    onChange={(e) => setGuided(setPathwayTick(getGuided(), s.id, e.target.checked))}
                  />
                  <span>{s.label}</span>
                </label>
                {s.reason === null ? null : (
                  <p id={reasonId} className="muted guided-pathway-reason">
                    Ruled out: {s.reason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p role="status" className={ticked === 0 ? 'guided-exposure-warn' : 'muted'}>
        {ticked === 0
          ? 'No pathway is ticked. Tick at least one to continue.'
          : `${ticked} of ${available} available pathways ticked.`}
      </p>
    </section>
  );
}
