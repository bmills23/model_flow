/** Keyboard-order helpers: which elements a Tab key press can land on, in the browser's order. */

const CANDIDATES =
  'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute('hidden') || n.hasAttribute('inert')) return true;
    if (n.getAttribute('aria-hidden') === 'true' && n !== el) return true;
    if (n.tagName === 'DETAILS' && !(n as HTMLDetailsElement).open && n !== el) {
      // only the summary of a closed disclosure is reachable
      const summary = n.querySelector(':scope > summary');
      if (!summary || !(summary === el || summary.contains(el))) return true;
    }
  }
  return false;
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || !!el.closest('fieldset[disabled]');
}

/** Elements with a tabindex of -1 or a disabled state are left out, as the browser does. */
export function tabbables(root: ParentNode): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES)).filter((el) => {
    if (isDisabled(el) || isHidden(el)) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false;
    if (ti === null && !el.matches('a[href], button, input, select, textarea, summary')) {
      return false;
    }
    return true;
  });
  // positive tabindex values come first in ascending order, then the rest in document order
  const positive = all
    .filter((e) => Number(e.getAttribute('tabindex')) > 0)
    .sort((a, b) => Number(a.getAttribute('tabindex')) - Number(b.getAttribute('tabindex')));
  return [...positive, ...all.filter((e) => !(Number(e.getAttribute('tabindex')) > 0))];
}

/** Natively interactive controls that a keyboard user is shut out of (tabindex -1 on a control). */
export function unreachableControls(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary'),
  ).filter((el) => {
    if (isDisabled(el) || isHidden(el)) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    const ti = el.getAttribute('tabindex');
    return ti !== null && Number(ti) < 0;
  });
}

/** Every element with a positive tabindex, which reorders the page away from its visual order. */
export function positiveTabindex(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[tabindex]')).filter(
    (el) => Number(el.getAttribute('tabindex')) > 0,
  );
}
