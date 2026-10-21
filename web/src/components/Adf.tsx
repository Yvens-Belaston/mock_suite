import type { ReactNode } from 'react';

/** Minimal Atlassian Document Format node (only what the renderer reads). */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  marks?: { type: string; attrs?: { href?: string } }[];
}

function renderText(node: AdfNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'strong') out = <strong>{out}</strong>;
    else if (mark.type === 'link' && mark.attrs?.href) {
      out = (
        <a href={mark.attrs.href} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
          {out}
        </a>
      );
    }
  }
  return <span key={key}>{out}</span>;
}

function renderNode(node: AdfNode, key: number): ReactNode {
  const children = (node.content ?? []).map(renderNode);
  switch (node.type) {
    case 'text':
      return renderText(node, key);
    case 'doc':
      return <div key={key}>{children}</div>;
    case 'paragraph':
      return (
        <p key={key} className="my-1">
          {children}
        </p>
      );
    case 'bulletList':
      return (
        <ul key={key} className="my-1 list-disc pl-5">
          {children}
        </ul>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    default:
      // Unknown block: keep its text readable.
      return <div key={key}>{children}</div>;
  }
}

/** Renders an ADF document (doc, paragraph, bulletList, listItem, text with strong/link marks). */
export function Adf({ doc }: { doc: unknown }) {
  if (!doc || typeof doc !== 'object') return null;
  return <>{renderNode(doc as AdfNode, 0)}</>;
}
