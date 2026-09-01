'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import { RichTextEditorToolbar } from '#components/rich-text-editor-toolbar';
import { buildRichTextEditorExtensions } from '#lib/rich-text/rich-text-editor-extensions';
import { cn } from '#lib/utils';

const EDITOR_CONTENT_CLASS_NAME = [
  'min-h-64 px-4 py-3 outline-none',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold',
  '[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_p]:my-1',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
  '[&_img]:my-2 [&_img]:max-w-full',
  '[&_.hms-page-break]:my-4 [&_.hms-page-break]:h-0 [&_.hms-page-break]:border-t-2 [&_.hms-page-break]:border-dashed [&_.hms-page-break]:border-muted-foreground/60',
  '[&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-ring',
].join(' ');

type RichTextEditorProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  onImageError?: (message: string) => void;
};

export function RichTextEditor({
  value,
  onValueChange,
  id,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  onImageError,
}: RichTextEditorProps): React.JSX.Element {
  const editor = useEditor({
    extensions: buildRichTextEditorExtensions(),
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id !== undefined ? { id } : {}),
        class: EDITOR_CONTENT_CLASS_NAME,
        'aria-label': ariaLabel ?? 'Rich text editor',
      },
    },
    onUpdate: (context) => onValueChange(context.editor.getHTML()),
  });
  React.useEffect(() => {
    if (!editor || editor.getHTML() === value) {
      return;
    }
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  if (!editor) {
    return (
      <div
        className={cn('min-h-64 rounded-md border border-input bg-transparent', className)}
        aria-busy
      />
    );
  }
  return (
    <div
      className={cn(
        'rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-ring/50',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <RichTextEditorToolbar editor={editor} disabled={disabled} onImageError={onImageError} />
      <EditorContent editor={editor} />
    </div>
  );
}
