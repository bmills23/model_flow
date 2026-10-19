import { registry } from '@model-flow/engine';
import { handleModeledRows } from '../cleanup/modeledUncertainty';
import { handleRows, type PoolRequest, type PoolResponse } from './protocol';

/** Answers one pool message: model rows by registered method id, or modeled cleanup rows. */
export function handlePoolRequest(
  req: PoolRequest,
  now: () => number = () => performance.now(),
): PoolResponse {
  if (req.type === 'modeled-cleanup') return handleModeledRows(req, now);
  return handleRows(req, (id) => registry.get(id), now);
}
