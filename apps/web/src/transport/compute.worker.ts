import { compute } from './compute';
import { fromWire, type WireRequest } from './runner';

self.onmessage = (e: MessageEvent<WireRequest>) => {
  self.postMessage(compute(fromWire(e.data)));
};
