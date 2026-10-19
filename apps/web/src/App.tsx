import { Suspense, lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { NON_AFFILIATION } from './nonAffiliation';
import { ProjectBar } from './project/ProjectBar';
import {
  getDroppedFeeds,
  getEpoch,
  getStaleFeeds,
  newProject,
  subscribeProject,
} from './project/store';

// Every screen loads on first visit so the entry chunk holds only the shell and the landing page.
const MethodsPage = lazy(() =>
  import('./pages/MethodsPage').then((m) => ({ default: m.MethodsPage })),
);
const TransportPage = lazy(() =>
  import('./transport/TransportPage').then((m) => ({ default: m.TransportPage })),
);
const SaturatedPage = lazy(() =>
  import('./saturated/SaturatedPage').then((m) => ({ default: m.SaturatedPage })),
);
const VadosePage = lazy(() =>
  import('./vadose/VadosePage').then((m) => ({ default: m.VadosePage })),
);

// The risk screen carries the chemical database loader; it and the RSL data load on first visit.
const VaporPage = lazy(() => import('./vapor/VaporPage').then((m) => ({ default: m.VaporPage })));
const SurfaceWaterScreen = lazy(() =>
  import('./surfaceWater/SurfaceWaterScreen').then((m) => ({ default: m.SurfaceWaterScreen })),
);
const HouseholdPage = lazy(() =>
  import('./household/HouseholdPage').then((m) => ({ default: m.HouseholdPage })),
);
const PlantsEcoPage = lazy(() =>
  import('./plantsEco/PlantsEcoPage').then((m) => ({ default: m.PlantsEcoPage })),
);
const RiskPage = lazy(() => import('./risk/RiskPage').then((m) => ({ default: m.RiskPage })));

const ReportPage = lazy(() =>
  import('./report/ReportPage').then((m) => ({ default: m.ReportPage })),
);

const CleanupPage = lazy(() =>
  import('./cleanup/CleanupPage').then((m) => ({ default: m.CleanupPage })),
);

const STEPS = ['Chemicals', 'Site model', 'Transport', 'Receptors', 'Risk & cleanup', 'Results'];

const METHODS_HASH = '#/methods';
const TRANSPORT_HASH = '#/transport';
const VADOSE_HASH = '#/vadose';
const SATURATED_HASH = '#/saturated';
const RISK_HASH = '#/risk';
const CLEANUP_HASH = '#/cleanup';
const REPORT_HASH = '#/report';
const VAPOR_HASH = '#/vapor';
const SURFACE_WATER_HASH = '#/surface-water';
const HOUSEHOLD_HASH = '#/household';
const PLANTS_ECO_HASH = '#/plants-eco';

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const epoch = useSyncExternalStore(subscribeProject, getEpoch, getEpoch);
  const [staleShown, setStaleShown] = useState(true);
  const stale = staleShown ? getStaleFeeds() : [];
  const dropped = staleShown ? getDroppedFeeds() : [];
  const onNewProject = (): void => {
    if (
      window.confirm(
        'Start a new project? This clears every screen, the values passed between screens, and the automatic save in this browser.',
      )
    ) {
      newProject();
      setStaleShown(false);
    }
  };
  const onMethods = hash === METHODS_HASH;
  const onTransport = hash === TRANSPORT_HASH;
  const onVadose = hash === VADOSE_HASH;
  const onSaturated = hash === SATURATED_HASH;
  const onRisk = hash === RISK_HASH;
  const onCleanup = hash === CLEANUP_HASH;
  const onVapor = hash === VAPOR_HASH;
  const onSurfaceWater = hash === SURFACE_WATER_HASH;
  const onHousehold = hash === HOUSEHOLD_HASH;
  const onPlantsEco = hash === PLANTS_ECO_HASH;
  const onReport = hash === REPORT_HASH;

  return (
    <div
      className={
        onReport
          ? 'shell shell-report'
          : onTransport ||
              onVadose ||
              onSaturated ||
              onRisk ||
              onVapor ||
              onCleanup ||
              onSurfaceWater ||
              onHousehold ||
              onPlantsEco
            ? 'shell shell-wide'
            : 'shell'
      }
    >
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // the hash is the router, so move focus instead of navigating
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to main content
      </a>
      <header className="masthead">
        <a className="brand" href="#/" aria-current={onMethods ? undefined : 'page'}>
          model_flow
        </a>
        <button type="button" className="btn masthead-action" onClick={onNewProject}>
          New project
        </button>
      </header>
      <ProjectBar />
      {dropped.length > 0 ? (
        <p className="stale-note" role="status">
          Some values passed between screens ({dropped.join(', ')}) could not be restored. Your
          inputs on every screen were kept; send those values again from their source screen.{' '}
          <button type="button" className="btn" onClick={() => setStaleShown(false)}>
            Dismiss
          </button>
        </p>
      ) : null}
      {stale.length > 0 ? (
        <p className="stale-note" role="status">
          Restored values passed between screens ({stale.join(', ')}) were built from inputs that
          have since changed. Send them again from their source screen to refresh them.{' '}
          <button type="button" className="btn" onClick={() => setStaleShown(false)}>
            Dismiss
          </button>
        </p>
      ) : null}
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
          <a className="nav-link" href={VAPOR_HASH} aria-current={onVapor ? 'page' : undefined}>
            Vapor intrusion
          </a>
          <a
            className="nav-link"
            href={SURFACE_WATER_HASH}
            aria-current={onSurfaceWater ? 'page' : undefined}
          >
            Surface water and sediment
          </a>
          <a
            className="nav-link"
            href={HOUSEHOLD_HASH}
            aria-current={onHousehold ? 'page' : undefined}
          >
            Shower, irrigation and particulates
          </a>
          <a
            className="nav-link"
            href={PLANTS_ECO_HASH}
            aria-current={onPlantsEco ? 'page' : undefined}
          >
            Plants, ecology and TPH
          </a>
          <a className="nav-link" href={RISK_HASH} aria-current={onRisk ? 'page' : undefined}>
            Exposure and risk
          </a>
          <a className="nav-link" href={CLEANUP_HASH} aria-current={onCleanup ? 'page' : undefined}>
            Cleanup levels
          </a>
          <a className="nav-link" href={REPORT_HASH} aria-current={onReport ? 'page' : undefined}>
            Report
          </a>
          <a className="nav-link" href={METHODS_HASH} aria-current={onMethods ? 'page' : undefined}>
            Methods &amp; References
          </a>
        </div>
      </nav>
      <main id="main" tabIndex={-1} key={epoch}>
        {onMethods ? (
          <Suspense fallback={<p className="muted">Loading the methods and references page...</p>}>
            <MethodsPage />
          </Suspense>
        ) : onTransport ? (
          <Suspense fallback={<p className="muted">Loading the groundwater transport screen...</p>}>
            <TransportPage />
          </Suspense>
        ) : onVadose ? (
          <Suspense fallback={<p className="muted">Loading the vadose leaching screen...</p>}>
            <VadosePage />
          </Suspense>
        ) : onSaturated ? (
          <Suspense fallback={<p className="muted">Loading the saturated soil source screen...</p>}>
            <SaturatedPage />
          </Suspense>
        ) : onVapor ? (
          <Suspense fallback={<p className="muted">Loading the vapor intrusion screen...</p>}>
            <VaporPage />
          </Suspense>
        ) : onSurfaceWater ? (
          <Suspense fallback={<p className="muted">Loading the surface water screen...</p>}>
            <SurfaceWaterScreen />
          </Suspense>
        ) : onHousehold ? (
          <Suspense fallback={<p className="muted">Loading the household screen...</p>}>
            <HouseholdPage />
          </Suspense>
        ) : onPlantsEco ? (
          <Suspense fallback={<p className="muted">Loading the plants and ecology screen...</p>}>
            <PlantsEcoPage />
          </Suspense>
        ) : onRisk ? (
          <Suspense fallback={<p className="muted">Loading the exposure and risk screen...</p>}>
            <RiskPage />
          </Suspense>
        ) : onReport ? (
          <Suspense fallback={<p className="muted">Loading the report...</p>}>
            <ReportPage />
          </Suspense>
        ) : onCleanup ? (
          <Suspense fallback={<p className="muted">Loading the cleanup levels screen...</p>}>
            <CleanupPage />
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
              <a className="button" href={VAPOR_HASH}>
                Open vapor intrusion
              </a>{' '}
              <a className="button" href={SURFACE_WATER_HASH}>
                Open surface water and sediment
              </a>{' '}
              <a className="button" href={HOUSEHOLD_HASH}>
                Open shower, irrigation and particulates
              </a>{' '}
              <a className="button" href={PLANTS_ECO_HASH}>
                Open plants, ecology and TPH
              </a>{' '}
              <a className="button" href={RISK_HASH}>
                Open exposure and risk
              </a>{' '}
              <a className="button" href={CLEANUP_HASH}>
                Open cleanup levels
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
