import { useMemo, useSyncExternalStore } from 'react';
import { getGuided, setGuided, subscribeGuided } from '../../project/store';
import { Seg } from '../../ui/controls';
import { chain, SOURCE_LABELS, type Chain } from '../chain';
import {
  MEASURED_MEDIUM_KEYS,
  MODELED_SOURCE_KEYS,
  defaultGuidedSite,
  type GuidedFormKey,
  type GuidedSite,
} from '../state';

/**
 * Step 2, the site model: a few questions about the site. The answers save to the guided state as they
 * change, and the side panel shows the chain of models they imply. A change of answer changes which
 * models the step 3d Run needs, so the step list marks the Run to run again.
 */

const MODEL_LABELS: Record<GuidedFormKey, string> = {
  vadose: 'Soil leaching model',
  saturated: 'Soil below the water table source model',
  transport: 'Groundwater transport model',
  vapor: 'Indoor air vapor model',
  surfaceWater: 'Surface water model',
  household: 'Household water use model',
  plantsEco: 'Produce and ecological screening model',
};

const PATHS: { key: keyof GuidedSite['paths']; label: string }[] = [
  { key: 'leaching', label: 'Leaching from soil to groundwater' },
  { key: 'well', label: 'A drinking water well' },
  { key: 'building', label: 'A building (vapor into indoor air)' },
  { key: 'stream', label: 'A stream that groundwater flows to' },
];

function ChainPanel({ result, site }: { result: Chain; site: GuidedSite }) {
  return (
    <section className="guided-chain" aria-label="Models your answers use" aria-live="polite">
      <h2>Models your answers use</h2>
      {result.problems.length > 0 ? (
        <div className="alert" role="alert">
          <strong>These answers do not work together yet:</strong>
          <ul>
            {result.problems.map((p) => (
              <li key={p.id}>{p.message}</li>
            ))}
          </ul>
        </div>
      ) : result.paths.length === 0 ? (
        <p className="muted">
          {site.basis === 'measured'
            ? 'Nothing is modeled: the concentrations you enter in step 3 are the exposure concentrations.'
            : 'Nothing to run yet.'}
        </p>
      ) : (
        <ol className="guided-chain-list">
          {result.paths.map((p) => (
            <li key={p.path}>
              <strong>{p.label}</strong>
              {p.source === null ? null : <p>Starts from: {p.sourceLabel.toLowerCase()}</p>}
              {p.models.length === 0 ? null : (
                <p>Models: {p.models.map((m) => MODEL_LABELS[m]).join(', ')}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {result.problems.length === 0 && result.models.length > 0 ? (
        <p className="muted">
          One Run in step 3 walks these models for every chemical:{' '}
          {result.models.map((m) => MODEL_LABELS[m].toLowerCase()).join(', ')}.
        </p>
      ) : null}
      {result.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}
    </section>
  );
}

export function SiteStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const site = guided.site;
  const result = useMemo(() => chain(site), [site]);
  const save = (next: GuidedSite): void => setGuided({ ...getGuided(), site: next });
  const set = <K extends keyof GuidedSite>(key: K, value: GuidedSite[K]): void =>
    save({ ...site, [key]: value });
  const toggle = <T extends string>(list: readonly T[], item: T, on: boolean): T[] =>
    on ? [...list, item] : list.filter((x) => x !== item);
  const modeled = site.basis === 'modeled';

  return (
    <section aria-labelledby="guided-site-heading" className="guided-site">
      <h1 id="guided-site-heading">Site model</h1>
      <p className="muted">
        Answer a few questions about the site. Your answers decide which models the Run in step 3
        uses for every chemical, and the panel beside them shows that chain as you go. You can
        change an answer at any time; the steps after this one then show that they need to run
        again.
      </p>
      <div className="guided-site-grid">
        <form className="guided-site-form" onSubmit={(e) => e.preventDefault()}>
          <Seg
            legend="Who is exposed"
            name="guidedReceptors"
            value={site.receptors}
            onChange={(v) => set('receptors', v)}
            options={[
              { value: 'human', label: 'People' },
              { value: 'ecological', label: 'Ecological receptors' },
            ]}
          />
          <Seg
            legend="Where the concentrations come from"
            name="guidedBasis"
            value={site.basis}
            onChange={(v) => set('basis', v)}
            options={[
              { value: 'modeled', label: 'Use the models' },
              { value: 'measured', label: 'Enter them directly' },
            ]}
          />
          {modeled ? (
            <>
              <fieldset className="guided-site-group">
                <legend>Where the contamination is</legend>
                {MODELED_SOURCE_KEYS.map((k) => (
                  <label key={k} className="guided-site-check">
                    <input
                      type="checkbox"
                      checked={site.sources.includes(k)}
                      onChange={(e) => set('sources', toggle(site.sources, k, e.target.checked))}
                    />
                    <span>{SOURCE_LABELS[k]}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="guided-site-group">
                <legend>Paths to follow</legend>
                {PATHS.map((p) => (
                  <label key={p.key} className="guided-site-check">
                    <input
                      type="checkbox"
                      checked={site.paths[p.key]}
                      onChange={(e) => set('paths', { ...site.paths, [p.key]: e.target.checked })}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </fieldset>
              <Seg
                legend="Where people are exposed"
                name="guidedLocation"
                value={site.location}
                onChange={(v) => set('location', v)}
                options={[
                  { value: 'onsite', label: 'Onsite' },
                  { value: 'downgradient', label: 'Downgradient' },
                ]}
              />
              {site.paths.building ? (
                <Seg
                  legend="Indoor air method"
                  name="guidedIndoorModel"
                  value={site.indoorModel}
                  onChange={(v) => set('indoorModel', v)}
                  options={[
                    { value: 'modern', label: 'Modern EPA method' },
                    { value: 'legacy', label: 'Legacy Johnson and Ettinger' },
                    { value: 'oxygenLimited', label: 'Oxygen-limited biodegradation' },
                  ]}
                />
              ) : null}
            </>
          ) : (
            <fieldset className="guided-site-group">
              <legend>Media you measured</legend>
              {MEASURED_MEDIUM_KEYS.map((k) => (
                <label key={k} className="guided-site-check">
                  <input
                    type="checkbox"
                    checked={site.measured.includes(k)}
                    onChange={(e) => set('measured', toggle(site.measured, k, e.target.checked))}
                  />
                  <span>{SOURCE_LABELS[k]}</span>
                </label>
              ))}
            </fieldset>
          )}
          {site.receptors === 'human' ? (
            <Seg
              legend="Homegrown produce takes its contaminant from"
              name="guidedProduce"
              value={site.produce}
              onChange={(v) => set('produce', v)}
              options={[
                { value: 'none', label: 'No homegrown produce' },
                { value: 'soil', label: 'Soil' },
                { value: 'irrigation', label: 'Irrigation water' },
              ]}
            />
          ) : null}
          <button type="button" className="btn" onClick={() => save(defaultGuidedSite())}>
            Clear these answers
          </button>
        </form>
        <ChainPanel result={result} site={site} />
      </div>
    </section>
  );
}
