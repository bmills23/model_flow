import {
  Suspense,
  lazy,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { sectionFromHash, slugFromHash } from './docs/catalog';
import { NON_AFFILIATION } from './nonAffiliation';
import type { GUIDED_STEPS } from './steps';
import {
  STEPS,
  WORKBENCH_HASH,
  WORKBENCH_REPORT_HASH,
  guidedHref,
  guidedStepForHash,
  isWorkbenchHash,
  redirectedHash,
  stepForHash,
} from './steps';
import { GuidedShell } from './guided/GuidedShell';
import { ProjectBar } from './project/ProjectBar';
import {
  getChemicals,
  getDroppedFeeds,
  getEpoch,
  newProject,
  subscribeChemicals,
  subscribeProject,
  type StaleSlot,
} from './project/store';
import { slotLabel, useStaleSlots } from './project/staleFeeds';
import { projectNameOf } from './project/feedChemical';

/** A stale slot as text, so a dismissal outlives the slot objects of one stale list. */
const slotKey = (s: StaleSlot): string => `${s.feed}\u0000${s.chemicalId}`;

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
const WorkbenchReportPage = lazy(() =>
  import('./report/ReportPage').then((m) => ({ default: m.WorkbenchReportPage })),
);
const WorkbenchPage = lazy(() =>
  import('./guided/WorkbenchPage').then((m) => ({ default: m.WorkbenchPage })),
);

const CleanupPage = lazy(() =>
  import('./cleanup/CleanupPage').then((m) => ({ default: m.CleanupPage })),
);

const ValidationPage = lazy(() =>
  import('./validation/ValidationPage').then((m) => ({ default: m.ValidationPage })),
);

const DocsPage = lazy(() => import('./docs/DocsPage').then((m) => ({ default: m.DocsPage })));

// The guided step screens, by step id.
const STEP_SCREENS: Record<(typeof GUIDED_STEPS)[number]['id'], ComponentType> = {
  chemicals: lazy(() =>
    import('./guided/screens/ChemicalsStep').then((m) => ({ default: m.ChemicalsStep })),
  ),
  site: lazy(() => import('./guided/screens/SiteStep').then((m) => ({ default: m.SiteStep }))),
  properties: lazy(() =>
    import('./guided/screens/PropertiesStep').then((m) => ({ default: m.PropertiesStep })),
  ),
  sources: lazy(() =>
    import('./guided/screens/SourcesStep').then((m) => ({ default: m.SourcesStep })),
  ),
  run: lazy(() => import('./guided/screens/RunStep').then((m) => ({ default: m.RunStep }))),
  pathways: lazy(() =>
    import('./guided/screens/PathwaysStep').then((m) => ({ default: m.PathwaysStep })),
  ),
  receptors: lazy(() =>
    import('./guided/screens/ReceptorsStep').then((m) => ({ default: m.ReceptorsStep })),
  ),
  toxicity: lazy(() =>
    import('./guided/screens/ToxicityStep').then((m) => ({ default: m.ToxicityStep })),
  ),
  targets: lazy(() =>
    import('./guided/screens/TargetsStep').then((m) => ({ default: m.TargetsStep })),
  ),
  results: lazy(() =>
    import('./guided/screens/ResultsStep').then((m) => ({ default: m.ResultsStep })),
  ),
};

function GuidedScreen({ id }: { id: (typeof GUIDED_STEPS)[number]['id'] }) {
  const Screen = STEP_SCREENS[id];
  return (
    <Suspense fallback={<p className="muted">Loading this step...</p>}>
      <Screen />
    </Suspense>
  );
}

const METHODS_HASH = '#/methods';
const VALIDATION_HASH = '#/validation';
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
const DOCS_HASH = '#/docs';

export function App() {
  // the retired #/site and #/chemicals open steps 2 and 1: the address is replaced, not added to history
  const [hash, setHash] = useState(() => redirectedHash(window.location.hash));
  useEffect(() => {
    const sync = () => {
      const next = redirectedHash(window.location.hash);
      if (next !== window.location.hash) window.location.replace(next);
      setHash(next);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const onWorkbench = isWorkbenchHash(hash);
  const epoch = useSyncExternalStore(subscribeProject, getEpoch, getEpoch);
  const [staleShown, setStaleShown] = useState(true);
  // the stale mark is live and per chemical (see project/staleFeeds); a dismissal covers the slots
  // stale when it was made, and a slot that clears and goes stale again is shown again
  const staleNow = useStaleSlots();
  const nowKeys = staleNow.map(slotKey);
  const chemicalList = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const [dismissedStale, setDismissedStale] = useState<readonly string[]>([]);
  // a dismissal belongs to the project it was made in: opening another project starts over
  const [dismissedEpoch, setDismissedEpoch] = useState(epoch);
  if (dismissedEpoch !== epoch) {
    setDismissedEpoch(epoch);
    setDismissedStale([]);
  }
  const stillDismissed = dismissedStale.filter((k) => nowKeys.includes(k));
  if (stillDismissed.length !== dismissedStale.length) setDismissedStale(stillDismissed);
  const stale = onWorkbench
    ? staleNow.filter((s) => dismissedEpoch !== epoch || !dismissedStale.includes(slotKey(s)))
    : [];
  // the values passed between screens exist only on the workbench screens, so their notes show there only
  const dropped = staleShown && onWorkbench ? getDroppedFeeds() : [];
  const onNewProject = (): void => {
    if (
      window.confirm(
        'Start a new project? This clears every screen, the values passed between screens, and the automatic save in this browser.',
      )
    ) {
      newProject();
      setStaleShown(false);
      setDismissedStale([]);
    }
  };
  const onMethods = hash === METHODS_HASH;
  const onValidation = hash === VALIDATION_HASH;
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
  const onWorkbenchPage = hash === WORKBENCH_HASH;
  const onWorkbenchReport = hash === WORKBENCH_REPORT_HASH;
  const currentStep = stepForHash(hash);
  const guidedStep = guidedStepForHash(hash);
  const onDocs = hash === DOCS_HASH || hash.startsWith(`${DOCS_HASH}/`);

  return (
    <div
      className={
        onReport || onWorkbenchReport
          ? 'shell shell-report'
          : onTransport ||
              onVadose ||
              onSaturated ||
              onRisk ||
              onVapor ||
              onCleanup ||
              onSurfaceWater ||
              onHousehold ||
              onPlantsEco ||
              onValidation ||
              guidedStep !== undefined
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
          These values passed between screens were built from inputs that have since changed:{' '}
          {stale.map((s) => slotLabel(s, projectNameOf(chemicalList))).join(', ')}. They are kept as
          they were sent. Send them again from their source screen to refresh them, or change the
          inputs back.{' '}
          <button type="button" className="btn" onClick={() => setDismissedStale(nowKeys)}>
            Dismiss
          </button>
        </p>
      ) : null}
      <nav aria-label="Main">
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.label}>
              <a
                className="step-link"
                href={step.href}
                aria-current={currentStep === step ? 'page' : undefined}
              >
                <span className="step-num">{i + 1}</span> {step.label}
              </a>
            </li>
          ))}
        </ol>
        <div className="nav-links">
          <a className="nav-link" href={REPORT_HASH} aria-current={onReport ? 'page' : undefined}>
            Report
          </a>
          <a
            className="nav-link"
            href={WORKBENCH_HASH}
            aria-current={onWorkbench ? 'page' : undefined}
          >
            Model workbench
          </a>
          <a className="nav-link" href={DOCS_HASH} aria-current={onDocs ? 'page' : undefined}>
            Documentation
          </a>
        </div>
      </nav>
      <main id="main" tabIndex={-1} key={epoch}>
        {guidedStep !== undefined ? (
          <GuidedShell stepId={guidedStep.id}>
            <GuidedScreen id={guidedStep.id} />
          </GuidedShell>
        ) : onDocs ? (
          <Suspense fallback={<p className="muted">Loading the documentation...</p>}>
            <DocsPage slug={slugFromHash(hash)} section={sectionFromHash(hash)} />
          </Suspense>
        ) : onValidation ? (
          <Suspense fallback={<p className="muted">Loading the validation page...</p>}>
            <ValidationPage />
          </Suspense>
        ) : onMethods ? (
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
        ) : onWorkbenchPage ? (
          <Suspense fallback={<p className="muted">Loading the model workbench...</p>}>
            <WorkbenchPage />
          </Suspense>
        ) : onWorkbenchReport ? (
          <Suspense fallback={<p className="muted">Loading the report...</p>}>
            <WorkbenchReportPage />
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
              modern alternatives for each process. Work through the six steps in order: they carry
              one project from the chemicals to a printed report, and any step opens at any time.
              The report gathers the results.
            </p>
            <p>
              <a className="button" href={guidedHref('chemicals')}>
                Start the guided flow
              </a>
            </p>
            <ol className="home-steps">
              {STEPS.map((step) => (
                <li key={step.label}>
                  <a href={step.href}>{step.label}</a>
                </li>
              ))}
            </ol>
            <p>
              <a className="button" href={REPORT_HASH}>
                Open the report
              </a>{' '}
              <a className="button" href={WORKBENCH_HASH}>
                Open the model workbench
              </a>{' '}
              <a className="button" href={DOCS_HASH}>
                Read the user guide
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
