import { registry } from '@model-flow/engine';
import { handleRows, type PoolRequest } from './protocol';

self.onmessage = (e: MessageEvent<PoolRequest>) => {
  self.postMessage(handleRows(e.data, (id) => registry.get(id)));
};
