'use client';

import { Fragment } from 'react';

import { parseInlineMarkdown } from '#lib/ai-assistant/parse-inline-markdown';

type MarkdownInlineProps = {
  text: string;
};

/**
 * One line of assistant text with its emphasis rendered. Every run becomes a
 * `<strong>`, `<em>`, `<code>` or bare string — never HTML from the model, so
 * there is nothing here for a provider to smuggle markup through.
 */
export function MarkdownInline({ text }: MarkdownInlineProps) {
  return (
    <>
      {parseInlineMarkdown(text).map((span, index) => {
        if (span.isCode) {
          return (
            <code
              key={index}
              className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] text-slate-800"
            >
              {span.text}
            </code>
          );
        }
        if (span.isBold && span.isItalic) {
          return (
            <strong key={index} className="font-semibold text-slate-900">
              <em>{span.text}</em>
            </strong>
          );
        }
        if (span.isBold) {
          return (
            <strong key={index} className="font-semibold text-slate-900">
              {span.text}
            </strong>
          );
        }
        if (span.isItalic) {
          return <em key={index}>{span.text}</em>;
        }
        return <Fragment key={index}>{span.text}</Fragment>;
      })}
    </>
  );
}
