import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { StarterKit } from '@tiptap/starter-kit';

import { PageBreakNode } from '#lib/rich-text/page-break-node';
import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';
import { VariableBlockNode } from '#lib/rich-text/variable-block-node';
import { VariableChipNode } from '#lib/rich-text/variable-chip-node';

const HEADING_LEVELS = [1, 2, 3] as const;

type BuildRichTextEditorExtensionsOptions = {
  /**
   * The variable registry the document is authored against. Chips look their
   * label up here on every render; an empty list makes every chip render in
   * its unknown-token state, which is the honest answer for a document with
   * no registry.
   */
  variables?: readonly RichTextVariableDefinition[];
};

/**
 * Extension set shared by the editor component and headless HTML round-trip
 * utilities. Links are disabled because the server-side template sanitiser
 * unwraps anchors; column resizing is disabled because the `colwidth`
 * attribute it emits does not survive sanitisation.
 */
export function buildRichTextEditorExtensions(
  options: BuildRichTextEditorExtensionsOptions = {},
): Extensions {
  const variables = options.variables ?? [];
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      link: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false, allowBase64: true }),
    PageBreakNode,
    VariableChipNode.configure({ variables }),
    VariableBlockNode.configure({ variables }),
  ];
}
