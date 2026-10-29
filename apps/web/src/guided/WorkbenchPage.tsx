import { WORKBENCH_ROUTES, guidedHref } from '../steps';

/**
 * The model workbench: every model screen that sits outside the steps. Each one still works on its own.
 * What you run here does not feed the steps, and what the steps hold does not fill these screens.
 */
export function WorkbenchPage() {
  return (
    <section className="workbench">
      <h1>Model workbench</h1>
      <p className="lede">
        Each model on its own, for checking one calculation at a time. Runs here do not feed the
        steps, and the steps do not fill these screens. To work through a whole project, use the six
        steps instead.
      </p>
      <ul className="workbench-list" aria-label="Workbench screens">
        {WORKBENCH_ROUTES.map((r) => (
          <li key={r.href}>
            <a className="workbench-link" href={r.href}>
              {r.label}
            </a>
            <span className="muted workbench-about">{r.about}</span>
          </li>
        ))}
      </ul>
      <p>
        <a className="button" href={guidedHref('chemicals')}>
          Back to the steps
        </a>
      </p>
    </section>
  );
}
