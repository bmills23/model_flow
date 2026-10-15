import type { MethodKey } from './compute';
import { SERIES } from './series';

export function Marker({ k, x, y }: { k: MethodKey; x: number; y: number }) {
  const cls = `mark ${SERIES[k].cls}`;
  if (k === 'legacy') return <circle cx={x} cy={y} r={4} className={cls} />;
  if (k === 'modern') return <rect x={x - 4} y={y - 4} width={8} height={8} className={cls} />;
  return <path d={`M${x},${y - 5}L${x + 5},${y}L${x},${y + 5}L${x - 5},${y}Z`} className={cls} />;
}
