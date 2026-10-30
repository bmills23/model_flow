import { useId, useState, useSyncExternalStore } from 'react';
import {
  AMBIGUOUS,
  REJECTED_ENTRY,
  getDecimalComma,
  readEntry,
  showNumber,
  subscribeDecimalComma,
} from './decimalComma';

/** A free-text box (a name, a citation). It never reads the decimal comma setting. */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Another element that describes the box (a problem the caller shows itself). */
  describedBy?: string | undefined;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        type="text"
        autoComplete="off"
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-describedby={props.describedBy}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

/**
 * A number box. Use `TextField` for text. `error` is a problem with the value the caller found (shown
 * under the box, announced, and referenced by the box); `describedBy` names another element that
 * describes the box (a problem the caller shows itself).
 */
export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  describedBy?: string | undefined;
  /** The phone keyboard: the decimal keypad by default; 'text' where letters or "<" are valid (ND, <0.5). */
  inputMode?: 'decimal' | 'text';
}) {
  const comma = useSyncExternalStore(subscribeDecimalComma, getDecimalComma, getDecimalComma);
  const id = useId();
  // the text the viewer typed when it could not be read, kept so it is not rewritten under them
  const [rejected, setRejected] = useState<{ text: string; message: string } | null>(null);
  // after a remount the typed text is gone but the form still holds the marker: say so, empty
  const live =
    props.value === REJECTED_ENTRY ? (rejected ?? { text: '', message: AMBIGUOUS }) : null;
  const shown = live !== null ? live.text : showNumber(props.value, comma);
  const ownError = live === null && props.error !== undefined && props.error !== '';
  const errorId = `${id}-error`;
  const describedBy =
    [live !== null ? id : undefined, ownError ? errorId : undefined, props.describedBy]
      .filter((x) => x !== undefined)
      .join(' ') || undefined;
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        type="text"
        inputMode={props.inputMode ?? 'decimal'}
        autoComplete="off"
        value={shown}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={live !== null || ownError ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const text = e.target.value;
          const r = readEntry(text, comma);
          if (r.ok) {
            setRejected(null);
            props.onChange(r.canonical);
          } else {
            // the form gets a marker that is not a number (never the typed text, and never saved)
            setRejected({ text, message: r.message });
            props.onChange(REJECTED_ENTRY);
          }
        }}
      />
      {live !== null && (
        <small id={id} role="alert" className="field-error">
          {live.message}
        </small>
      )}
      {ownError && (
        <small id={errorId} role="alert" className="field-error">
          {props.error}
        </small>
      )}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export function Seg<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="seg">
      <legend>{props.legend}</legend>
      <div className="seg-row">
        {props.options.map((o) => (
          <label key={o.value} className={props.value === o.value ? 'on' : undefined}>
            <input
              type="radio"
              name={props.name}
              value={o.value}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A collapsible group. `open` asks for it to be open (it defaults to open); it is a request to open, not a
 * lock: once open it stays open until the viewer closes it, so a group that was opened because a value was
 * needed does not collapse under the viewer's hands when typing that value ends the need.
 */
export function Group(props: { title: string; children: React.ReactNode; open?: boolean }) {
  const requested = props.open ?? true;
  const [open, setOpen] = useState(requested);
  const [wasRequested, setWasRequested] = useState(requested);
  if (requested !== wasRequested) {
    setWasRequested(requested);
    if (requested) setOpen(true);
  }
  return (
    <details
      className="group"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{props.title}</summary>
      <div className="group-body">{props.children}</div>
    </details>
  );
}
