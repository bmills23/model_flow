import { scaleLinear } from 'd3-scale';
import { convert } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import type { WellFeed } from '../transport/wellFeed';
import type { ModelProblem, RunPlan } from './derive';
import { MODEL_WORDS } from './derive';
import type { GuidedOutputs, GuidedRun } from './state';
import { indoorAirRows, inputBlocks } from './runView';
import type { RunChemical } from './runCsv';

/**
 * The step 3d results (plan section 4): the concentration over time at the well for each chemical, the
 * indoor air by chemical, the summary of what the models were given, and the detail of each chemical.
 */

const W = 520;
const H = 220;
const M = { l: 64, r: 14, t: 12, b: 40 };
const toYr = (s: number): number => convert(s, 's', 'yr');

function WellChart({ name, feed }: { name: string; feed: WellFeed }) {
  const t = feed.times.map(toYr);
  const c = feed.values.map((v) => v * 1e3);
  const peak = Math.max(0, ...c);
  const sx = scaleLinear()
    .domain([0, t[t.length - 1] || 1])
    .range([M.l, W - M.r]);
  const sy = scaleLinear()
    .domain([0, peak > 0 ? peak * 1.08 : 1])
    .range([H - M.b, M.t])
    .nice();
  const path = t
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(c[i]!).toFixed(1)}`)
    .join('');
  const peakAt = c.indexOf(peak);
  return (
    <div className="guided-run-chart">
      <h3>{name}</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${name}: groundwater concentration at the well over ${formatConcentration(t[t.length - 1] ?? 0)} years, peak ${formatConcentration(peak)} mg/L at ${formatConcentration(t[peakAt] ?? 0)} years`}
      >
        {sy.ticks(4).map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="guided-run-grid" />
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="guided-run-tick">
              {formatConcentration(v)}
            </text>
          </g>
        ))}
        {sx.ticks(5).map((v) => (
          <text
            key={`x${v}`}
            x={sx(v)}
            y={H - M.b + 16}
            textAnchor="middle"
            className="guided-run-tick"
          >
            {v}
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="guided-run-tick">
          Time (years)
        </text>
        <text
          transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="guided-run-tick"
        >
          Concentration (mg/L)
        </text>
        <path d={path} className="guided-run-line" fill="none" />
      </svg>
      <details>
        <summary>Show the values as a table</summary>
        <div className="guided-run-scroll">
          <table className="compare" aria-label={`${name} at the well, values`}>
            <thead>
              <tr>
                <th scope="col">Time (years)</th>
                <th scope="col">Concentration (mg/L)</th>
              </tr>
            </thead>
            <tbody>
              {t.map((x, i) => (
                <tr key={i}>
                  <td>{formatConcentration(x)}</td>
                  <td>{formatConcentration(c[i]!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function RunResults(props: {
  outputs: GuidedOutputs;
  chemicals: readonly RunChemical[];
  plan: RunPlan;
  run: GuidedRun;
  /** What the last Run in this session found per chemical (a model that could not run, and why). */
  problems: ReadonlyMap<string, ModelProblem[]> | null;
}) {
  const { outputs, chemicals, plan, run } = props;
  const wells = chemicals.filter((c) => outputs['well']?.[c.id] !== undefined);
  const air = indoorAirRows(outputs, chemicals);
  return (
    <div className="guided-run-results">
      {plan.outputs.includes('well') && (
        <section aria-labelledby="guided-run-well">
          <h2 id="guided-run-well">Concentration over time at the well</h2>
          {wells.length === 0 ? (
            <p className="muted">No groundwater result for any chemical yet.</p>
          ) : (
            <div className="guided-run-charts">
              {wells.map((c) => (
                <WellChart
                  key={c.id}
                  name={c.name}
                  feed={outputs['well']![c.id]!.value as WellFeed}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {plan.outputs.includes('vaporRisk') && (
        <section aria-labelledby="guided-run-air">
          <h2 id="guided-run-air">Indoor air</h2>
          {air.length === 0 ? (
            <p className="muted">No indoor air result for any chemical yet.</p>
          ) : (
            <div className="guided-run-scroll">
              <table className="compare" aria-label="Indoor air by chemical">
                <thead>
                  <tr>
                    <th scope="col">Chemical</th>
                    <th scope="col">Highest indoor air concentration (mg/m3)</th>
                    <th scope="col">Source it started from</th>
                    <th scope="col">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {air.map((r) => (
                    <tr key={r.chemical}>
                      <th scope="row">{r.chemical}</th>
                      <td>{formatConcentration(r.peakMgPerM3)}</td>
                      <td>{r.source}</td>
                      <td>{r.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="guided-run-summary">
        <h2 id="guided-run-summary">Model input summary</h2>
        <div className="guided-run-scroll">
          <table className="compare" aria-label="Run settings and models">
            <tbody>
              <tr>
                <th scope="row">Method basis</th>
                <td>
                  {run.basis === 'modern'
                    ? 'Modern, with legacy as the check'
                    : 'Legacy, with modern as the check'}
                </td>
              </tr>
              <tr>
                <th scope="row">Simulation time</th>
                <td>{run.timeYr} years</td>
              </tr>
              <tr>
                <th scope="row">Time step (groundwater transport curve)</th>
                <td>
                  {run.stepYr} years, {plan.settings.nCurve} points
                </td>
              </tr>
              <tr>
                <th scope="row">Models run</th>
                <td>{plan.models.map((m) => MODEL_WORDS[m]).join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="guided-run-detail">
        <h2 id="guided-run-detail">Detail for each chemical</h2>
        {chemicals.map((c) => {
          const blocks = inputBlocks(outputs, c.id);
          const problems = props.problems?.get(c.id) ?? [];
          return (
            <div key={c.id} role="group" aria-label={c.name} className="guided-run-detail">
              <h3>{c.name}</h3>
              {problems.length > 0 && (
                <ul className="guided-run-problems" role="alert">
                  {problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              )}
              {blocks.length === 0 && problems.length === 0 && (
                <p className="muted">No results recorded for this chemical yet.</p>
              )}
              {blocks.map((b) => (
                <details key={b.model}>
                  <summary>What the {b.model} was given</summary>
                  <dl className="guided-run-inputs">
                    {b.rows.map((r, i) => (
                      <div key={i}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
