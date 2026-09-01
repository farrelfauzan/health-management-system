import { Node } from '@tiptap/core';

/**
 * The serialized form is constrained by the server-side template sanitiser
 * (`sanitise-template-html.ts` in the API): only `class` and `style` survive on
 * arbitrary elements, so the break is carried as an inline
 * `page-break-after:always` style. The class only styles the editor surface.
 */
const PAGE_BREAK_CLASS_NAME = 'hms-page-break';
const PAGE_BREAK_INLINE_STYLE = 'page-break-after:always';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: `div.${PAGE_BREAK_CLASS_NAME}` }, { tag: 'div[style*="page-break-after"]' }];
  },
  renderHTML() {
    return ['div', { class: PAGE_BREAK_CLASS_NAME, style: PAGE_BREAK_INLINE_STYLE }];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
