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
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

/** A number box. Use `TextField` for text. */
export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const comma = useSyncExternalStore(subscribeDecimalComma, getDecimalComma, getDecimalComma);
  const id = useId();
  // the text the viewer typed when it could not be read, kept so it is not rewritten under them
  const [rejected, setRejected] = useState<{ text: string; message: string } | null>(null);
  // after a remount the typed text is gone but the form still holds the marker: say so, empty
  const live =
    props.value === REJECTED_ENTRY ? (rejected ?? { text: '', message: AMBIGUOUS }) : null;
  const shown = live !== null ? live.text : showNumber(props.value, comma);
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={live !== null ? true : undefined}
        aria-describedby={live !== null ? id : undefined}
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

export function Group(props: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group" open={props.open ?? true}>
      <summary>{props.title}</summary>
      <div className="group-body">{props.children}</div>
    </details>
  );
}
