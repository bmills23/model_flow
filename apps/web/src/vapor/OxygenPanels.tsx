import type { DevaullResult } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Field, Group, Seg } from '../ui/controls';
import type { VaporForm } from './form';
import { OXYGEN_MODES } from './oxygenLimited';

const sig = (v: number): string => formatConcentration(v);
const MGM3 = 1e-6; // kg/m3 per mg/m3

type Setter = <K extends keyof VaporForm>(key: K, value: VaporForm[K]) => void;

/**
 * Inputs of the oxygen-limited indoor method (DeVaull). The soil, source, building and chemical above
 * are shared with the other two methods; these are the aerobic biodegradation and its oxygen. The oxygen
 * properties have no default: no verifiable public source was found for them.
 */
export function OxygenInputs(props: {
  form: VaporForm;
  set: Setter;
  chosen: boolean;
  onChoose: () => void;
}) {
  const { form, set } = props;
  const oxygenOption = form.dvOxMode !== 'entered';
  return (
    <Group title="Oxygen-limited biodegradation (DeVaull)" open={props.chosen}>
      <p className="derived">
        The chemical degrades only where oxygen reaches it. The soil between the source and the
        foundation is split into a deeper layer with no oxygen and a shallower aerobic layer where
        the chemical degrades at a first-order rate. For this method the strata below the floor are
        treated as one layer with thickness-weighted porosity and water-filled porosity, so with
        several strata it differs from the other two methods even with no aerobic layer. It gives
        indoor air only.
      </p>
      {!props.chosen && (
        <p>
          <button type="button" className="btn" onClick={props.onChoose}>
            Show the oxygen-limited results
          </button>
        </p>
      )}
      <div className="fields">
        <Field
          label="Aerobic first-order rate (1/h)"
          value={form.dvKw}
          onChange={(v) => set('dvKw', v)}
          hint="Water-phase rate. Picking a chemical fills the default rate of its class (BioVapor manual, Appendix C). Blank: the chemical has no class rate and is treated as non-degrading."
        />
      </div>
      <Seg
        legend="Aerobic layer"
        name="vaporOxygenMode"
        value={form.dvOxMode}
        onChange={(v) => set('dvOxMode', v)}
        options={OXYGEN_MODES}
      />
      {!oxygenOption ? (
        <div className="fields">
          <Field
            label="Aerobic layer depth (m)"
            value={form.dvAerobicDepth}
            onChange={(v) => set('dvAerobicDepth', v)}
            hint="Thickness of the aerobic layer under the foundation, from 0 to the distance between the source and the foundation."
          />
        </div>
      ) : (
        <>
          <p className="muted">
            {form.dvOxMode === 'fastReaction'
              ? 'Chemical and oxygen meet at a reaction front; its depth balances the oxygen supplied from the foundation against the hydrocarbon arriving from the source.'
              : 'The depth is found where the oxygen supply just meets the oxygen demand of the hydrocarbon degrading through the aerobic layer.'}
          </p>
          <div className="fields">
            <Field
              label="Oxygen at the base of the foundation (% by volume)"
              value={form.dvO2Percent}
              onChange={(v) => set('dvO2Percent', v)}
              hint="In the soil gas. Converted with the ideal gas law at 1 atm and the soil temperature."
            />
            <Field
              label="Oxygen mass ratio (g O2 per g chemical)"
              value={form.dvMassRatio}
              onChange={(v) => set('dvMassRatio', v)}
              hint="Complete oxidation. Filled from the chemical's formula; blank for a chemical not in a published class."
            />
            <Field
              label="Oxygen diffusion in air (cm2/s)"
              value={form.dvDa}
              onChange={(v) => set('dvDa', v)}
              hint="Required: no default is given."
            />
            <Field
              label="Oxygen diffusion in water (cm2/s)"
              value={form.dvDw}
              onChange={(v) => set('dvDw', v)}
              hint="Required: no default is given."
            />
            <Field
              label="Oxygen Henry's constant (-)"
              value={form.dvH}
              onChange={(v) => set('dvH', v)}
              hint="Air over water, dimensionless. Required: no default is given."
            />
            <Field
              label="Total hydrocarbon vapor at the source (mg/m3)"
              value={form.dvTotalHc}
              onChange={(v) => set('dvTotalHc', v)}
              hint="Every oxygen-consuming hydrocarbon. Blank: the chemical alone sets the oxygen demand and the aerobic layer is overestimated."
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={form.dvRespiration}
              onChange={(e) => set('dvRespiration', e.target.checked)}
            />
            <span>
              Include baseline soil respiration (1.69 mg O2 per g organic carbon per day, times the
              organic carbon and bulk density of the strata below the floor)
            </span>
          </label>
        </>
      )}
    </Group>
  );
}

function Pair(props: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="readout">
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

/** The layers, fluxes and oxygen balance of an oxygen-limited run. */
export function OxygenDetails(props: { result: DevaullResult }) {
  const r = props.result;
  const mode = r.oxygen?.mode ?? 'entered';
  const label = OXYGEN_MODES.find((m) => m.value === mode)?.label ?? mode;
  const LT = r.aerobicDepth + r.anaerobicDepth;
  return (
    <section className="panel" aria-label="Oxygen-limited details">
      <h2>Oxygen-limited (DeVaull) details</h2>
      <dl className="readouts">
        <Pair term="Indoor air">
          <strong>{sig(r.concentration / MGM3)}</strong> mg/m3
        </Pair>
        <Pair term="Source vapor">
          <strong>{sig(r.sourceVapor / MGM3)}</strong> mg/m3
        </Pair>
        <Pair term="Attenuation coefficient">
          <strong>{sig(r.coefficient)}</strong>
        </Pair>
        <Pair term="Aerobic layer option">
          <strong>{label}</strong>
        </Pair>
        <Pair term="Aerobic layer">
          <strong>{sig(r.aerobicDepth)}</strong> m of {sig(LT)} m ({sig(100 * r.aerobicFraction)}{' '}
          percent), anaerobic layer {sig(r.anaerobicDepth)} m
        </Pair>
        <Pair term="Aerobic thickness over reaction length">
          <strong>{sig(r.a)}</strong>
        </Pair>
        <Pair term="Vapor at the top of the anaerobic layer">
          <strong>{sig(r.Ca / MGM3)}</strong> mg/m3
        </Pair>
        <Pair term="Vapor at the base of the foundation">
          <strong>{sig(r.Cb / MGM3)}</strong> mg/m3
        </Pair>
        <Pair term="Flux into the building">
          <strong>{sig(r.fluxTop * 1e6)}</strong> mg/(m2 s)
        </Pair>
        <Pair term="Degraded in the aerobic layer">
          <strong>{sig(r.degradationRate * 1e6)}</strong> mg/(m2 s)
        </Pair>
        <Pair term="Effective diffusion through the soil">
          <strong>{sig(r.Deff * 1e4)}</strong> cm2/s over {sig(LT)} m
        </Pair>
        <Pair term="Foundation and indoor air conductance">
          <strong>{sig(r.topConductance)}</strong> m/s
        </Pair>
        {r.oxygen && (
          <>
            <Pair term="Effective oxygen diffusion through the soil">
              <strong>{sig(r.oxygen.Deff * 1e4)}</strong> cm2/s
            </Pair>
            <Pair term="Hydrocarbon vapor setting the oxygen demand">
              <strong>{sig(r.oxygen.demandVapor / MGM3)}</strong> mg/m3
            </Pair>
            {r.oxygen.wholly && (
              <Pair term="Column">
                <strong>wholly {r.oxygen.wholly}</strong>
              </Pair>
            )}
          </>
        )}
      </dl>
    </section>
  );
}
