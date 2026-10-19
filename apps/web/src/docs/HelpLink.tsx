import { helpHref, type HelpTarget } from './help';

// The Help link under a screen's title. It opens the user guide section for that screen in the reader.
export function HelpLink({ target }: { target: HelpTarget }) {
  return (
    <p className="help-link-row">
      <a className="help-link" href={helpHref(target)}>
        Help
      </a>
    </p>
  );
}
