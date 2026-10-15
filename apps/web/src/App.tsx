import { useEffect, useState } from 'react';
import { MethodsPage } from './pages/MethodsPage';
import { TransportPage } from './transport/TransportPage';

const STEPS = ['Chemicals', 'Site model', 'Transport', 'Receptors', 'Risk & cleanup', 'Results'];

const NON_AFFILIATION =
  'This project is independent. It is not affiliated with, endorsed by, or derived from the software of Spence Environmental Engineering, BP, or GroundwaterSoftware.com. "RISC" and "BP RISC" are their marks.';

const METHODS_HASH = '#/methods';
const TRANSPORT_HASH = '#/transport';

export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const onMethods = hash === METHODS_HASH;
  const onTransport = hash === TRANSPORT_HASH;

  return (
    <div className={onTransport ? 'shell shell-wide' : 'shell'}>
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
        <a className="nav-link" href={METHODS_HASH} aria-current={onMethods ? 'page' : undefined}>
          Methods &amp; References
        </a>
      </nav>
      <main>
        {onMethods ? (
          <MethodsPage />
        ) : onTransport ? (
          <TransportPage />
        ) : (
          <section>
            <h1>Fate-and-transport and risk modeling</h1>
            <p className="lede">
              An open reimplementation of RISC5-class methods with a switch between legacy and
              modern alternatives for each process. Groundwater transport is working; the other
              steps are placeholders for the milestones on the roadmap.
            </p>
            <p>
              <a className="button" href={TRANSPORT_HASH}>
                Open groundwater transport
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
