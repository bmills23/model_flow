import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getChemicals, getGuided, subscribeChemicals, subscribeGuided } from '../project/store';
import { GUIDED_STEPS, guidedHref, type GuidedStepId } from '../steps';
import { guidedStatus, type OutputCheck, type StepMark } from './status';
import { useGuidedOutputCheck } from './useOutputCheck';

/**
 * The guided flow's frame: the step list (above the content at phone width, beside it on a wide screen)
 * with done, current, to do and run-again marks in text, and Back and Next. Every step opens from the
 * list at any time.
 */

const MARK_TEXT: Record<StepMark, string> = {
  done: 'Done',
  todo: 'To do',
  'run-again': 'Run again',
  checking: 'Checking',
};

interface GuidedShellProps {
  stepId: GuidedStepId;
  children: ReactNode;
  outputCheck?: OutputCheck;
  /** Step 3a's check that no needed site field is blank (see `guidedStatus`). */
  propertiesComplete?: () => boolean;
}

export function GuidedShell({
  stepId,
  children,
  outputCheck: injected,
  propertiesComplete,
}: GuidedShellProps) {
  // the hash compare of each output with its live inputs, unless a check is injected
  const liveCheck = useGuidedOutputCheck();
  const outputCheck = injected ?? liveCheck;
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const status = useMemo(
    () =>
      guidedStatus({
        chemicals,
        guided,
        outputCheck,
        ...(propertiesComplete === undefined ? {} : { propertiesComplete }),
      }),
    [chemicals, guided, outputCheck, propertiesComplete],
  );
  const index = GUIDED_STEPS.findIndex((s) => s.id === stepId);
  const back = index > 0 ? GUIDED_STEPS[index - 1] : undefined;
  const next = index >= 0 && index < GUIDED_STEPS.length - 1 ? GUIDED_STEPS[index + 1] : undefined;

  return (
    <div className="guided">
      <nav className="guided-steps" aria-label="Guided steps">
        <p className="guided-steps-title">Your steps</p>
        <ol>
          {GUIDED_STEPS.map((step) => {
            const current = step.id === stepId;
            const mark = step.arrives
              ? 'Arrives with the next update'
              : current
                ? 'Current'
                : MARK_TEXT[status[step.id]];
            return (
              <li key={step.id}>
                <a
                  className="guided-step"
                  href={guidedHref(step.id)}
                  aria-current={current ? 'step' : undefined}
                  data-mark={step.arrives ? 'arrives' : current ? 'current' : status[step.id]}
                >
                  <span className="guided-step-num">{step.number}</span>
                  <span className="guided-step-label">{step.label}</span>
                  <span className="guided-step-mark">{mark}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="guided-content">
        {children}
        <div className="guided-pager">
          <a className="button" href={back === undefined ? '#/' : guidedHref(back.id)}>
            Back
          </a>
          {next === undefined ? (
            <span className="button guided-pager-off" aria-disabled="true">
              Next
            </span>
          ) : (
            <a className="button" href={guidedHref(next.id)}>
              Next
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
