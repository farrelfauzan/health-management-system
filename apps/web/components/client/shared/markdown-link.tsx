'use client';

import type { ComponentPropsWithoutRef } from 'react';
import type { ExtraProps } from 'react-markdown';

type MarkdownLinkProps = ComponentPropsWithoutRef<'a'> & ExtraProps;

/**
 * A link inside rendered Markdown.
 *
 * Opens in a new tab: a link in a clinic document points somewhere else, and
 * following it in place would close the preview and lose the reader's place.
 * `noopener noreferrer` keeps the target from reaching back into this tab.
 * The `href` has already been through react-markdown's URL filter, which
 * empties `javascript:` and every other unsafe scheme.
 */
export function MarkdownLink({ href, title, children }: MarkdownLinkProps) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}
