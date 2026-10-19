import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWidth } from './useWidth';

// A figure like the transport charts: a 1px border and 12px side padding. The border box is 400 px wide,
// so the content box, where the svg belongs, is 400 - 24 - 2 = 374 px.
function Probe({ tag, style }: { tag: 'figure' | 'div'; style: React.CSSProperties }) {
  const [ref, width] = useWidth();
  const Tag = tag;
  return (
    <Tag ref={ref as never} style={style} data-testid="box">
      <span>{width}</span>
    </Tag>
  );
}

describe('useWidth', () => {
  let original: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: 400,
        height: 100,
        top: 0,
        left: 0,
        right: 400,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    };
    vi.stubGlobal('ResizeObserver', undefined);
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    vi.unstubAllGlobals();
  });

  it('measures the content box of a padded and bordered figure', () => {
    render(
      <Probe tag="figure" style={{ padding: '10px 12px', borderWidth: '1px', borderStyle: 'solid' }} />,
    );
    expect(screen.getByTestId('box').textContent).toBe('374');
  });

  it('keeps the border box width for an unpadded element', () => {
    render(<Probe tag="div" style={{}} />);
    expect(screen.getByTestId('box').textContent).toBe('400');
  });
});
