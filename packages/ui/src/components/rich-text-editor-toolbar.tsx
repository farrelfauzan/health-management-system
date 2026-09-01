'use client';

import * as React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  SeparatorHorizontal,
  Underline,
  Undo2,
} from 'lucide-react';

import { RichTextEditorImageButton } from '#components/rich-text-editor-image-button';
import { RichTextEditorTableMenu } from '#components/rich-text-editor-table-menu';
import { RichTextEditorToolbarButton } from '#components/rich-text-editor-toolbar-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/select';
import { Separator } from '#components/separator';

const PARAGRAPH_BLOCK_VALUE = 'paragraph';
const HEADING_BLOCK_OPTIONS = [
  { value: PARAGRAPH_BLOCK_VALUE, label: 'Paragraph', level: 0 },
  { value: 'heading-1', label: 'Heading 1', level: 1 },
  { value: 'heading-2', label: 'Heading 2', level: 2 },
  { value: 'heading-3', label: 'Heading 3', level: 3 },
] as const;

type RichTextEditorToolbarProps = {
  editor: Editor;
  disabled?: boolean;
  onImageError?: (message: string) => void;
};

export function RichTextEditorToolbar({
  editor,
  disabled = false,
  onImageError,
}: RichTextEditorToolbarProps): React.JSX.Element {
  const toolbarState = useEditorState({
    editor,
    selector: (context) => ({
      isBold: context.editor.isActive('bold'),
      isItalic: context.editor.isActive('italic'),
      isUnderline: context.editor.isActive('underline'),
      isBulletList: context.editor.isActive('bulletList'),
      isOrderedList: context.editor.isActive('orderedList'),
      isAlignLeft: context.editor.isActive({ textAlign: 'left' }),
      isAlignCenter: context.editor.isActive({ textAlign: 'center' }),
      isAlignRight: context.editor.isActive({ textAlign: 'right' }),
      isAlignJustify: context.editor.isActive({ textAlign: 'justify' }),
      isInsideTable: context.editor.isActive('table'),
      activeHeadingLevel:
        HEADING_BLOCK_OPTIONS.find(
          (option) => option.level > 0 && context.editor.isActive('heading', { level: option.level }),
        )?.value ?? PARAGRAPH_BLOCK_VALUE,
      canUndo: context.editor.can().undo(),
      canRedo: context.editor.can().redo(),
    }),
  });
  function handleBlockChange(value: string): void {
    const option = HEADING_BLOCK_OPTIONS.find((candidate) => candidate.value === value);
    if (!option || option.level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().toggleHeading({ level: option.level }).run();
  }
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-border p-1"
    >
      <Select
        value={toolbarState.activeHeadingLevel}
        onValueChange={handleBlockChange}
        disabled={disabled}
      >
        <SelectTrigger size="sm" aria-label="Text style" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HEADING_BLOCK_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <RichTextEditorToolbarButton
        label="Bold"
        isActive={toolbarState.isBold}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Italic"
        isActive={toolbarState.isItalic}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Underline"
        isActive={toolbarState.isUnderline}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-4" />
      </RichTextEditorToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <RichTextEditorToolbarButton
        label="Bullet list"
        isActive={toolbarState.isBulletList}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Numbered list"
        isActive={toolbarState.isOrderedList}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </RichTextEditorToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <RichTextEditorToolbarButton
        label="Align left"
        isActive={toolbarState.isAlignLeft}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleTextAlign('left').run()}
      >
        <AlignLeft className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Align center"
        isActive={toolbarState.isAlignCenter}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleTextAlign('center').run()}
      >
        <AlignCenter className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Align right"
        isActive={toolbarState.isAlignRight}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleTextAlign('right').run()}
      >
        <AlignRight className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Justify"
        isActive={toolbarState.isAlignJustify}
        disabled={disabled}
        onPress={() => editor.chain().focus().toggleTextAlign('justify').run()}
      >
        <AlignJustify className="size-4" />
      </RichTextEditorToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <RichTextEditorTableMenu
        editor={editor}
        isInsideTable={toolbarState.isInsideTable}
        disabled={disabled}
      />
      <RichTextEditorImageButton editor={editor} disabled={disabled} onImageError={onImageError} />
      <RichTextEditorToolbarButton
        label="Horizontal rule"
        disabled={disabled}
        onPress={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Page break"
        disabled={disabled}
        onPress={() => editor.chain().focus().insertPageBreak().run()}
      >
        <SeparatorHorizontal className="size-4" />
      </RichTextEditorToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <RichTextEditorToolbarButton
        label="Undo"
        disabled={disabled || !toolbarState.canUndo}
        onPress={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" />
      </RichTextEditorToolbarButton>
      <RichTextEditorToolbarButton
        label="Redo"
        disabled={disabled || !toolbarState.canRedo}
        onPress={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" />
      </RichTextEditorToolbarButton>
    </div>
  );
}
