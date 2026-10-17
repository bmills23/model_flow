import { Suspense, lazy, useEffect, useState } from 'react';
import { MethodsPage } from './pages/MethodsPage';
import { TransportPage } from './transport/TransportPage';
import { SaturatedPage } from './saturated/SaturatedPage';
import { VadosePage } from './vadose/VadosePage';

// The risk screen carries the chemical database loader; it and the RSL data load on first visit.
const SurfaceWaterScreen = lazy(() =>
  import('./surfaceWater/SurfaceWaterScreen').then((m) => ({ default: m.SurfaceWaterScreen })),
);
const RiskPage = lazy(() => import('./risk/RiskPage').then((m) => ({ default: m.RiskPage })));

const STEPS = ['Chemicals', 'Site model', 'Transport', 'Receptors', 'Risk & cleanup', 'Results'];

const NON_AFFILIATION =
  'This project is independent. It is not affiliated with, endorsed by, or derived from the software of Spence Environmental Engineering, BP, or GroundwaterSoftware.com. "RISC" and "BP RISC" are their marks.';

const METHODS_HASH = '#/methods';
const TRANSPORT_HASH = '#/transport';
const VADOSE_HASH = '#/vadose';
const SATURATED_HASH = '#/saturated';
const RISK_HASH = '#/risk';
const SURFACE_WATER_HASH = '#/surface-water';

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const onMethods = hash === METHODS_HASH;
  const onTransport = hash === TRANSPORT_HASH;
  const onVadose = hash === VADOSE_HASH;
  const onSaturated = hash === SATURATED_HASH;
  const onRisk = hash === RISK_HASH;
  const onSurfaceWater = hash === SURFACE_WATER_HASH;

  return (
    <div
      className={
        onTransport || onVadose || onSaturated || onRisk || onSurfaceWater
          ? 'shell shell-wide'
          : 'shell'
      }
    >
      <header className="masthead">
        <a className="brand" href="#/" aria-current={onMethods ? undefined : 'page'}>
          model_flow
        </a>
      </header>
      <nav aria-label="Main">
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step}>
              {step === 'Transport' ? (
                <a
                  className="step-link"
                  href={TRANSPORT_HASH}
                  aria-current={onTransport ? 'page' : undefined}
                >
                  <span className="step-num">{i + 1}</span> {step}
                </a>
              ) : (
                <button type="button" disabled>
                  <span className="step-num">{i + 1}</span> {step}
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className="nav-links">
          <a className="nav-link" href={VADOSE_HASH} aria-current={onVadose ? 'page' : undefined}>
            Vadose leaching
          </a>
          <a
            className="nav-link"
            href={SATURATED_HASH}
            aria-current={onSaturated ? 'page' : undefined}
          >
            Saturated soil source
          </a>
          <a
            className="nav-link"
            href={SURFACE_WATER_HASH}
            aria-current={onSurfaceWater ? 'page' : undefined}
          >
            Surface water and sediment
          </a>
          <a className="nav-link" href={RISK_HASH} aria-current={onRisk ? 'page' : undefined}>
            Exposure and risk
          </a>
          <a className="nav-link" href={METHODS_HASH} aria-current={onMethods ? 'page' : undefined}>
            Methods &amp; References
          </a>
        </div>
      </nav>
      <main>
        {onMethods ? (
          <MethodsPage />
        ) : onTransport ? (
          <TransportPage />
        ) : onVadose ? (
          <VadosePage />
        ) : onSaturated ? (
          <SaturatedPage />
        ) : onSurfaceWater ? (
          <Suspense fallback={<p className="muted">Loading the surface water screen...</p>}>
            <SurfaceWaterScreen />
          </Suspense>
        ) : onRisk ? (
          <Suspense fallback={<p className="muted">Loading the exposure and risk screen...</p>}>
            <RiskPage />
          </Suspense>
        ) : (
          <section>
            <h1>Fate-and-transport and risk modeling</h1>
            <p className="lede">
              An open reimplementation of RISC5-class methods with a switch between legacy and
              modern alternatives for each process. Groundwater transport, vadose leaching, the
              saturated soil source, surface water and sediment, and exposure and risk are working;
              the other steps are placeholders for the milestones on the roadmap.
            </p>
            <p>
              <a className="button" href={TRANSPORT_HASH}>
                Open groundwater transport
              </a>{' '}
              <a className="button" href={VADOSE_HASH}>
                Open vadose leaching
              </a>{' '}
              <a className="button" href={SATURATED_HASH}>
                Open saturated soil source
              </a>{' '}
              <a className="button" href={SURFACE_WATER_HASH}>
                Open surface water and sediment
              </a>{' '}
              <a className="button" href={RISK_HASH}>
                Open exposure and risk
              </a>{' '}
              <a className="button" href={METHODS_HASH}>
                Read how each calculation is sourced
              </a>
            </p>
          </section>
        )}
      </main>
      <footer>
        <p>{NON_AFFILIATION}</p>
      </footer>
    </div>
  );
}
