/** Form controls that expose no accessible name (no label, aria-label or aria-labelledby text). */

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').trim();
}

function hasName(el: Element): boolean {
  if ((el.getAttribute('aria-label') ?? '').trim()) return true;
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const doc = el.ownerDocument;
    if (by.split(/\s+/).some((id) => textOf(doc.getElementById(id)))) return true;
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && Array.from(labels).some((l) => textOf(l))) return true;
  if (el.closest('label') && textOf(el.closest('label'))) return true;
  return false;
}

export function unlabelledControls(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll('input, select, textarea'))) {
    if (
      el instanceof HTMLInputElement &&
      ['hidden', 'submit', 'button', 'reset', 'image'].includes(el.type)
    )
      continue;
    if (!hasName(el)) out.push(el);
  }
  return out;
}
