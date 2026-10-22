import { getHeldSlots, type StaleFeedKey } from './store';

const FEED_LABELS: Record<StaleFeedKey, string> = {
  well: 'groundwater well result',
  bank: 'river bank result',
  transportChain: 'groundwater run for cleanup',
  surfaceWater: 'surface water result',
  vadose: 'vadose zone result',
  saturated: 'saturated zone result',
  vaporVadose: 'vapor source from the vadose zone',
  vaporWaterTable: 'vapor source from the water table',
  vaporSaturated: 'vapor source from the saturated zone',
  vaporRisk: 'vapor air result',
  household: 'household result',
  produce: 'produce result',
  tph: 'TPH result',
};

/**
 * The question before a chemical is taken out of the project. It names what goes with it: the
 * chemical's row and everything entered on it on the exposure and risk and the cleanup levels screens,
 * and every result held for it. Nothing changes until the person confirms.
 */
export function RemoveChemicalConfirm(props: {
  id: string;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const held = getHeldSlots(props.id).map((k) => FEED_LABELS[k]);
  return (
    <div className="alert" role="group" aria-label={`Remove ${props.name} from the project?`}>
      <p>
        <strong>Remove {props.name} from the project?</strong> This deletes its row and everything
        entered on it on the exposure and risk screen and on the cleanup levels screen
        {held.length > 0 ? `, and the results held for it: ${held.join(', ')}` : ''}.{' '}
        {/^user-\d+$/.test(props.id)
          ? 'It also deletes its surface water target and toxicity values, and a screen set to it is set back to no chemical, keeping the values typed there.'
          : 'A screen that is set to it keeps that choice and shows it as no longer in the project.'}{' '}
        This cannot be undone.
      </p>
      <p>
        <button type="button" className="btn remove" onClick={props.onConfirm}>
          Remove from the project
        </button>{' '}
        <button type="button" className="btn" onClick={props.onCancel}>
          Keep it
        </button>
      </p>
    </div>
  );
}
