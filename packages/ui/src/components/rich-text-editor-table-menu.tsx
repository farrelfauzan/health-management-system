'use client';

import * as React from 'react';
import type { Editor } from '@tiptap/react';
import { Table as TableIcon } from 'lucide-react';

import { Button } from '#components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/dropdown-menu';

const INSERTED_TABLE_ROWS = 3;
const INSERTED_TABLE_COLUMNS = 3;

type RichTextEditorTableMenuProps = {
  editor: Editor;
  isInsideTable: boolean;
  disabled?: boolean;
};

export function RichTextEditorTableMenu({
  editor,
  isInsideTable,
  disabled = false,
}: RichTextEditorTableMenuProps): React.JSX.Element {
  function insertTable(): void {
    editor
      .chain()
      .focus()
      .insertTable({ rows: INSERTED_TABLE_ROWS, cols: INSERTED_TABLE_COLUMNS, withHeaderRow: true })
      .run();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Table"
          title="Table"
          disabled={disabled}
          className="size-8"
        >
          <TableIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={insertTable}>Insert table</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().addRowAfter().run()}
        >
          Add row below
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().addColumnAfter().run()}
        >
          Add column right
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().deleteRow().run()}
        >
          Delete row
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().deleteColumn().run()}
        >
          Delete column
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
        >
          Toggle header row
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!isInsideTable}
          onSelect={() => editor.chain().focus().deleteTable().run()}
        >
          Delete table
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
