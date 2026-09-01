import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { StarterKit } from '@tiptap/starter-kit';

import { PageBreakNode } from '#lib/rich-text/page-break-node';

const HEADING_LEVELS = [1, 2, 3] as const;

/**
 * Extension set shared by the editor component and headless HTML round-trip
 * utilities. Links are disabled because the server-side template sanitiser
 * unwraps anchors; column resizing is disabled because the `colwidth`
 * attribute it emits does not survive sanitisation.
 */
export function buildRichTextEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      link: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false, allowBase64: true }),
    PageBreakNode,
  ];
}
