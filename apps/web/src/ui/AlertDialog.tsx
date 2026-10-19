import { useEffect, useRef, type ReactNode } from 'react';

/**
 * An inline `role="alertdialog"` confirmation with real focus behaviour. When it mounts, focus
 * moves to its last button (the quiet, non-destructive choice); Escape inside it cancels; when it
 * unmounts, focus returns to the control that was focused when it opened. The trigger is often
 * disabled while the run it started winds down, so the return waits a bounded number of frames
 * until the trigger can take focus. It is skipped if the trigger left the document or the user has
 * already moved focus to another live control.
 */
const MAX_FRAMES = 120;

export function AlertDialog(props: {
  label: string;
  onCancel: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = node ? Array.from(node.querySelectorAll<HTMLButtonElement>('button')) : [];
    (buttons[buttons.length - 1] ?? node)?.focus();

    return () => {
      let frame = 0;
      const restore = () => {
        if (!trigger || !trigger.isConnected) return;
        const active = document.activeElement;
        if (active && active !== document.body && active !== trigger && active.isConnected) return;
        if (!(trigger as HTMLButtonElement).disabled) {
          trigger.focus();
          return;
        }
        if (++frame < MAX_FRAMES) requestAnimationFrame(restore);
      };
      requestAnimationFrame(restore);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={props.className}
      role="alertdialog"
      aria-label={props.label}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          props.onCancel();
        }
      }}
    >
      {props.children}
    </div>
  );
}
