import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { RichTextVariableChipView } from '#components/rich-text-variable-chip-view';
import { isTemplateVariableToken } from '#lib/rich-text/is-template-variable-token';
import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';

/**
 * Serialized form is the sanitiser's canonical chip: an **empty** span whose
 * only attribute is the token. No label, no class — the API strips both
 * from any element carrying `data-hms-var`, so nothing else would survive a
 * save anyway, and the render service substitutes by exact token match.
 */
export const VARIABLE_TOKEN_ATTRIBUTE = 'data-hms-var';

export type VariableChipNodeOptions = {
  variables: readonly RichTextVariableDefinition[];
};

export type InsertVariableParams = {
  token: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableChip: {
      insertVariableChip: (params: InsertVariableParams) => ReturnType;
    };
  }
}

/**
 * An inline atom for a scalar registry token (`P16-T11`, FR-E1-03).
 *
 * Atomic on purpose: the caret cannot enter it, typing never splits it, and
 * Backspace/Delete removes it whole — ProseMirror's `atom` contract, not a
 * key handler. The label is re-materialised from `options.variables` by the
 * node view on every render, so loading sanitised HTML (empty canonical
 * spans) shows labelled chips again and the round-trip is idempotent.
 */
export const VariableChipNode = Node.create<VariableChipNodeOptions>({
  name: 'variableChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { variables: [] };
  },
  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(VARIABLE_TOKEN_ATTRIBUTE),
        renderHTML: (attributes: { token?: string | null }) => ({
          [VARIABLE_TOKEN_ATTRIBUTE]: attributes.token ?? '',
        }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: `span[${VARIABLE_TOKEN_ATTRIBUTE}]`,
        getAttrs: (element: HTMLElement) =>
          isTemplateVariableToken(element.getAttribute(VARIABLE_TOKEN_ATTRIBUTE)) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RichTextVariableChipView);
  },
  addCommands() {
    return {
      insertVariableChip:
        (params: InsertVariableParams) =>
        ({ commands }) => {
          if (!isTemplateVariableToken(params.token)) {
            return false;
          }
          return commands.insertContent({ type: this.name, attrs: { token: params.token } });
        },
    };
  },
});
