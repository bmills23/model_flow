import { handlePoolRequest } from './dispatch';
import type { PoolRequest } from './protocol';

self.onmessage = (e: MessageEvent<PoolRequest>) => {
  self.postMessage(handlePoolRequest(e.data));
};
