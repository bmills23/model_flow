import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { DOCS_HASH, docHash, docs, findDoc, resolveLink, type DocEntry } from './catalog';
import { parseInline, parseMarkdown, sectionId, type Block, type ListItem } from './markdown';

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((part, i) => {
    switch (part.type) {
      case 'code':
        return <code key={i}>{part.text}</code>;
      case 'strong':
        return <strong key={i}>{part.text}</strong>;
      case 'em':
        return <em key={i}>{part.text}</em>;
      case 'link': {
        const target = resolveLink(part.href);
        if (target.kind === 'external')
          return (
            <a key={i} href={target.href} target="_blank" rel="noopener noreferrer">
              {part.text}
            </a>
          );
        if (target.kind === 'doc')
          return (
            <a key={i} href={target.href}>
              {part.text}
            </a>
          );
        return <Fragment key={i}>{part.text}</Fragment>;
      }
      default:
        return <Fragment key={i}>{part.text}</Fragment>;
    }
  });
}

function renderItems(items: ListItem[]): ReactNode {
  return items.map((it, i) => (
    <li key={i}>
      {renderInline(it.text)}
      {it.children.length > 0 ? renderBlocks(it.children) : null}
    </li>
  ));
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, b.level);
      const Tag = `h${level}` as 'h1';
      return (
        <Tag key={key} id={sectionId(b.text)} tabIndex={-1}>
          {renderInline(b.text)}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={key}>{renderInline(b.text)}</p>;
    case 'code':
      return (
        <pre key={key} className="doc-code" tabIndex={0} aria-label="Code sample">
          <code>{b.text}</code>
        </pre>
      );
    case 'list':
      return b.ordered ? (
        <ol key={key}>{renderItems(b.items)}</ol>
      ) : (
        <ul key={key}>{renderItems(b.items)}</ul>
      );
    case 'table':
      return (
        <table key={key} className="doc-table">
          <thead>
            <tr>
              {b.header.map((h, i) => (
                <th key={i} scope="col">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} data-label={b.header[i]}>
                    {renderInline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'quote':
      return <blockquote key={key}>{renderInline(b.text)}</blockquote>;
    case 'rule':
      return <hr key={key} />;
  }
}

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map(renderBlock);
}

function DocView({ entry, section }: { entry: DocEntry; section: string | null }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    entry.load().then(
      (text) => live && setSource(text),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [entry]);
  // A section link scrolls to its heading and moves focus there, so a screen reader starts at it.
  useEffect(() => {
    if (source === null || section === null) return;
    const el = document.getElementById(section);
    if (!el) return;
    el.scrollIntoView?.({ block: 'start' });
    el.focus({ preventScroll: true });
  }, [source, section]);
  if (failed) return <p role="alert">This document could not be loaded.</p>;
  if (source === null) return <p className="muted">Loading the document...</p>;
  return <article className="doc-body">{renderBlocks(parseMarkdown(source))}</article>;
}

const GROUPS: DocEntry['group'][] = ['Guide', 'Methods notes', 'Sources'];

export function DocsPage({ slug, section = null }: { slug: string | null; section?: string | null }) {
  const entry = slug === null ? undefined : findDoc(slug);
  if (slug !== null && entry === undefined) {
    return (
      <section className="docs">
        <p>
          <a href={DOCS_HASH}>All documentation</a>
        </p>
        <h1>Documentation</h1>
        <p>There is no document called {slug}.</p>
      </section>
    );
  }
  if (entry) {
    return (
      <section className="docs" aria-label={entry.title}>
        <p className="doc-back">
          <a href={DOCS_HASH}>All documentation</a>
        </p>
        <DocView key={entry.slug} entry={entry} section={section} />
      </section>
    );
  }
  return (
    <section className="docs" aria-labelledby="docs-heading">
      <h1 id="docs-heading">Documentation</h1>
      <p className="lede">
        The user guide, the methods notes behind each calculation, and the attributions. Everything
        here is the same text that is committed to the repository.
      </p>
      {GROUPS.map((g) => (
        <section key={g} aria-label={g}>
          <h2>{g}</h2>
          <ul className="doc-list">
            {docs
              .filter((d) => d.group === g)
              .map((d) => (
                <li key={d.slug}>
                  <a href={docHash(d.slug)}>{d.title}</a>
                  {d.summary !== '' ? <span className="muted"> {d.summary}</span> : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
