const DATE_LINE = /^Generated (\d{4}-\d{2}-\d{2}) /m;

/**
 * Renders a generated document whose date moves only when its content changes: if rendering with the
 * previous date reproduces the existing text exactly, the existing text is kept.
 */
export function renderStable(
  render: (date: string) => string,
  existing: string | undefined,
  today: string,
): string {
  if (existing !== undefined) {
    const previous = DATE_LINE.exec(existing)?.[1];
    if (previous !== undefined && render(previous) === existing) return existing;
  }
  return render(today);
}
