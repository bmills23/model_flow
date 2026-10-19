import { useEffect, useRef, useState } from 'react';

const px = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Measured content-box width of the element in CSS pixels, so charts draw in real pixels (readable text on
 * phones). The border box minus padding and border is what an svg inside the element can fill; using the
 * border box made the svg wider than the content, and the figure's own padding clipped it.
 */
export function useWidth(fallback = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const style = getComputedStyle(el);
      const inset =
        px(style.paddingLeft) +
        px(style.paddingRight) +
        px(style.borderLeftWidth) +
        px(style.borderRightWidth);
      const w = Math.floor(el.getBoundingClientRect().width - inset);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
