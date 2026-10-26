import { runMessages, type RunJob } from './run';

/** The step 3d Run's background worker: every chemical's jobs, one after another, with progress. */
self.onmessage = (e: MessageEvent<RunJob[]>) => {
  runMessages(e.data, (m) => self.postMessage(m));
};
