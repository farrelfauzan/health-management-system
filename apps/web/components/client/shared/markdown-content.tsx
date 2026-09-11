'use client';

import { cn } from '@hms/ui';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MarkdownLink } from '#components/client/shared/markdown-link';

const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS = { a: MarkdownLink };

/**
 * Images are dropped rather than rendered: a remote `src` would make the app
 * fetch whatever URL a document names, from the viewer's browser, in the app
 * origin. A corpus document is text the assistant quotes; a picture in it is
 * not something the assistant can use anyway.
 */
const DISALLOWED_ELEMENTS = ['img'];

/**
 * Document typography, applied from the wrapper rather than per element so
 * the Markdown renders through react-markdown's own elements and this file
 * stays one component. There is no typography plugin in this repo.
 */
const MARKDOWN_TYPOGRAPHY = [
  'break-words text-sm leading-relaxed text-slate-800',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-slate-900',
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900',
  '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold',
  '[&_p]:my-2 [&_strong]:font-semibold [&_del]:line-through',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600',
  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_hr]:my-4 [&_hr]:border-slate-200',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
  '[&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top',
].join(' ');

type MarkdownContentProps = {
  markdown: string;
  className?: string;
};

/**
 * Renders a Markdown string for reading.
 *
 * Safe for operator-uploaded text by construction, not by trusting the
 * source: `skipHtml` drops any raw HTML in the Markdown instead of rendering
 * it, react-markdown's URL filter empties `javascript:` and other unsafe
 * link targets, images are not rendered, and there is no
 * `dangerouslySetInnerHTML` anywhere on the path — every node is a React
 * element. GitHub-flavoured tables, task lists and strikethrough are on
 * because clinic FAQs are written with them.
 */
export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  return (
    <div className={cn(MARKDOWN_TYPOGRAPHY, className)} data-testid="markdown-content">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={MARKDOWN_COMPONENTS}
        disallowedElements={DISALLOWED_ELEMENTS}
        skipHtml
      >
        {markdown}
      </Markdown>
    </div>
  );
}
