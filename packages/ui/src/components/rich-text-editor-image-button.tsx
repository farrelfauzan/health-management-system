'use client';

import * as React from 'react';
import type { Editor } from '@tiptap/react';
import { ImagePlus } from 'lucide-react';

import { RichTextEditorToolbarButton } from '#components/rich-text-editor-toolbar-button';
import { readImageFileAsDataUrl } from '#lib/rich-text/read-image-file-as-data-url';

type RichTextEditorImageButtonProps = {
  editor: Editor;
  disabled?: boolean;
  onImageError?: (message: string) => void;
};

export function RichTextEditorImageButton({
  editor,
  disabled = false,
  onImageError,
}: RichTextEditorImageButtonProps): React.JSX.Element {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const result = await readImageFileAsDataUrl(file);
    if (result.error !== undefined) {
      onImageError?.(result.error);
      return;
    }
    editor.chain().focus().setImage({ src: result.dataUrl, alt: file.name }).run();
  }
  return (
    <>
      <RichTextEditorToolbarButton
        label="Insert image"
        disabled={disabled}
        onPress={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="size-4" />
      </RichTextEditorToolbarButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
