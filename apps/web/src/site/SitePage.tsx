import { useMemo, useSyncExternalStore } from 'react';
import { HelpLink } from '../docs/HelpLink';
import { getSite, setSite, subscribeProject } from '../project/store';
import { Seg } from '../ui/controls';
import { checklist } from './checklist';
import { MEDIUM_LABELS, defaultSite, mediaFor, type SiteState, type SourceMedium } from './model';

/**
 * The site model screen: a few choices about the site that produce an advisory, ordered checklist of the
 * screens to visit and the feed button to press on each. Nothing on any other screen is locked or changed.
 */
export function SitePage() {
  const site = useSyncExternalStore(subscribeProject, getSite, getSite);
  const result = useMemo(() => checklist(site), [site]);
  const set = <K extends keyof SiteState>(key: K, value: SiteState[K]): void =>
    setSite({ ...site, [key]: value });
  const toggleMedium = (m: SourceMedium, on: boolean): void =>
    set('media', on ? [...site.media, m] : site.media.filter((x) => x !== m));
  const vaporChosen =
    site.basis === 'modeled' &&
    (site.media.includes('soilToIndoorAir') || site.media.includes('soilGasToIndoorAir'));

  return (
    <section aria-labelledby="site-heading" className="vadose site-model">
      <h1 id="site-heading">Site model</h1>
      <HelpLink target="site" />
      <p className="muted">
        Answer a few questions about the site and this page lists the screens to visit, in order,
        and the button to press on each to pass a value on. It is advice only: nothing is locked,
        and no other screen changes when you change an answer here.
      </p>

      <div className="site-grid">
        <form className="site-form" onSubmit={(e) => e.preventDefault()}>
          <Seg
            legend="Who is exposed"
            name="siteReceptors"
            value={site.receptors}
            onChange={(v) => set('receptors', v)}
            options={[
              { value: 'human', label: 'Human' },
              { value: 'ecological', label: 'Ecological' },
            ]}
          />
          <Seg
            legend="Source concentrations"
            name="siteBasis"
            value={site.basis}
            onChange={(v) =>
              setSite({
                ...site,
                basis: v,
                media: site.media.filter((m) => mediaFor(v).includes(m)),
              })
            }
            options={[
              { value: 'direct', label: 'Enter them directly' },
              { value: 'modeled', label: 'Use the models' },
            ]}
          />
          <fieldset className="site-media">
            <legend>Source medium (one)</legend>
            {mediaFor(site.basis).map((m) => (
              <label key={m} className="site-check">
                <input
                  type="checkbox"
                  checked={site.media.includes(m)}
                  onChange={(e) => toggleMedium(m, e.target.checked)}
                />
                <span>{MEDIUM_LABELS[m]}</span>
              </label>
            ))}
          </fieldset>
          <Seg
            legend="Exposure point"
            name="siteLocation"
            value={site.location}
            onChange={(v) => set('location', v)}
            options={[
              { value: 'onsite', label: 'Onsite' },
              { value: 'downgradient', label: 'Downgradient' },
            ]}
          />
          {vaporChosen ? (
            <Seg
              legend="Vapor intrusion method"
              name="siteVaporMethod"
              value={site.vaporMethod}
              onChange={(v) => set('vaporMethod', v)}
              options={[
                { value: 'modern', label: 'Modern EPA' },
                { value: 'legacy', label: 'Legacy J&E' },
              ]}
            />
          ) : null}
          <fieldset className="site-media">
            <legend>Homegrown produce takes its contaminant from</legend>
            <label className="site-check">
              <input
                type="checkbox"
                checked={site.produceSoil}
                onChange={(e) => set('produceSoil', e.target.checked)}
              />
              <span>Soil</span>
            </label>
            <label className="site-check">
              <input
                type="checkbox"
                checked={site.produceIrrigation}
                onChange={(e) => set('produceIrrigation', e.target.checked)}
              />
              <span>Irrigation water</span>
            </label>
          </fieldset>
          <button type="button" className="btn" onClick={() => setSite(defaultSite())}>
            Reset the choices
          </button>
        </form>

        <div className="site-result" aria-live="polite">
          {result.problems.length > 0 ? (
            <div className="alert" role="alert">
              <strong>These choices do not work together:</strong>
              <ul>
                {result.problems.map((p) => (
                  <li key={p.id}>{p.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <h2>Suggested order</h2>
              <ol className="site-list">
                {result.items.map((i) => (
                  <li key={i.id}>
                    <a href={i.href}>{i.screen}</a>
                    <span className="muted"> ({i.step})</span>
                    <p>{i.action}</p>
                    {i.feed ? (
                      <p>
                        Then press <strong>{i.feed}</strong>.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
              {result.notes.map((n) => (
                <p key={n} className="muted">
                  {n}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
