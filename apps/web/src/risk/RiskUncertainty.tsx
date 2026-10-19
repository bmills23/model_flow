import { useMemo } from 'react';
import type { LegacyScenarioInput } from '@model-flow/engine';
import { UncertaintyPanel } from '../uncertainty/UncertaintyPanel';
import {
  EXPOSURE_DISPLAYS,
  EXPOSURE_MODEL_ID,
  exposureOutputs,
  exposureUncertainty,
} from './uncertaintySetup';

/** The uncertainty panel on the exposure screen: it samples the legacy method's receptor factors. */
export function RiskUncertainty(props: { base: LegacyScenarioInput }) {
  const { base } = props;
  const model = useMemo(() => exposureUncertainty(base), [base]);
  const outputs = useMemo(() => exposureOutputs(base), [base]);
  return (
    <>
      <UncertaintyPanel
        model={model}
        modelId={EXPOSURE_MODEL_ID}
        base={base}
        outputs={outputs}
        displays={EXPOSURE_DISPLAYS}
      />
      <p className="muted">
        The analysis samples the legacy method&apos;s receptor factors (body weight, exposure
        duration, exposure frequency and water ingestion rate). The modern method does not declare
        sampled inputs yet.
      </p>
    </>
  );
}
