'use client';

import { Fragment } from 'react';

import { MarkdownInline } from '#components/client/ai-assistant/markdown-inline';
import type { MarkdownBlock } from '#lib/ai-assistant/markdown-block';

type MarkdownBlockViewProps = {
  block: MarkdownBlock;
};

/**
 * One block of an assistant reply, laid out as what it is. Headings render as
 * `h4` rather than `h2`: the message sits inside a page that already owns the
 * higher levels, and a reply must not outrank the screen it appears on.
 */
export function MarkdownBlockView({ block }: MarkdownBlockViewProps) {
  if (block.kind === 'HEADING') {
    return (
      <h4 className="text-sm font-semibold text-slate-900">
        <MarkdownInline text={block.text} />
      </h4>
    );
  }
  if (block.kind === 'BULLETS') {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((item, index) => (
          <li key={index}>
            <MarkdownInline text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === 'NUMBERS') {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {block.items.map((item, index) => (
          <li key={index}>
            <MarkdownInline text={item} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <p>
      {block.lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          <MarkdownInline text={line} />
        </Fragment>
      ))}
    </p>
  );
}
