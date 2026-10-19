const UNLOAD_PROMPT =
  'This project has changes that are not saved to a file. Leave anyway? Use Save project first to keep them.';

/**
 * Ask the browser to confirm before the tab closes or reloads while `hasChanges()` is true.
 * Returns the cleanup that removes the listener (call it on unmount).
 */
export function warnBeforeUnload(
  hasChanges: () => boolean,
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onBeforeUnload = (event: Event): void => {
    if (!hasChanges()) return;
    event.preventDefault();
    // older browsers read returnValue instead of preventDefault
    (event as BeforeUnloadEvent).returnValue = UNLOAD_PROMPT;
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}
