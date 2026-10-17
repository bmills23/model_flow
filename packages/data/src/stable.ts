/** The local calendar date as YYYY-MM-DD. toISOString would use the UTC day, which is a day ahead in the evening. */
export function localIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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
