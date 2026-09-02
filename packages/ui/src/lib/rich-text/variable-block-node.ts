import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { RichTextVariableBlockView } from '#components/rich-text-variable-block-view';
import { isTemplateVariableToken } from '#lib/rich-text/is-template-variable-token';
import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';
import { VARIABLE_TOKEN_ATTRIBUTE, type InsertVariableParams } from '#lib/rich-text/variable-chip-node';

export type VariableBlockNodeOptions = {
  variables: readonly RichTextVariableDefinition[];
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableBlock: {
      insertVariableBlock: (params: InsertVariableParams) => ReturnType;
    };
  }
}

/**
 * The block-level counterpart of {@link VariableChipNode} for repeating
 * tokens such as `items` (`P16-T11`, FR-E1-04). Serialises to the canonical
 * `<div data-hms-var="items"></div>`; the render service expands it into the
 * line-item table, and the editor shows a placeholder table in its place.
 * Column choice lives in the template `settings`, never on this element —
 * the sanitiser keeps nothing but the token attribute.
 */
export const VariableBlockNode = Node.create<VariableBlockNodeOptions>({
  name: 'variableBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
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
        tag: `div[${VARIABLE_TOKEN_ATTRIBUTE}]`,
        getAttrs: (element: HTMLElement) =>
          isTemplateVariableToken(element.getAttribute(VARIABLE_TOKEN_ATTRIBUTE)) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RichTextVariableBlockView);
  },
  addCommands() {
    return {
      insertVariableBlock:
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
