'use client';

import * as React from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Rows3, TriangleAlert } from 'lucide-react';

import { findRichTextVariable } from '#lib/rich-text/find-rich-text-variable';
import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';
import { cn } from '#lib/utils';

const PLACEHOLDER_ROW_COUNT = 3;

type VariableBlockOptions = {
  variables?: readonly RichTextVariableDefinition[];
};

/**
 * Editor-only rendering of a repeating block token as a placeholder table:
 * the author sees where the rows will land without the editor pretending to
 * know the line items. Which columns appear is configured beside the editor
 * and stored in the template settings, not here.
 */
export function RichTextVariableBlockView(props: NodeViewProps): React.JSX.Element {
  const token = String(props.node.attrs.token ?? '');
  const options = props.extension.options as VariableBlockOptions;
  const variable = findRichTextVariable(options.variables ?? [], token);
  const isUnknown = variable === undefined;
  return (
    <NodeViewWrapper
      as="div"
      data-testid="variable-block"
      data-token={token}
      data-state={isUnknown ? 'unknown' : 'known'}
      className={cn(
        'my-2 select-none rounded-md border border-dashed p-2 text-xs',
        isUnknown ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-primary/40 bg-primary/5 text-primary',
        props.selected && 'ring-2 ring-ring',
      )}
    >
      <div className="mb-1 flex items-center gap-1 font-medium">
        {isUnknown ? (
          <TriangleAlert className="size-3" aria-hidden />
        ) : (
          <Rows3 className="size-3" aria-hidden />
        )}
        <span>{isUnknown ? `Unknown variable: ${token}` : variable.label}</span>
      </div>
      {isUnknown ? null : (
        <div className="space-y-1 opacity-60">
          {Array.from({ length: PLACEHOLDER_ROW_COUNT }, (_value, index) => (
            <div key={index} className="h-2 rounded bg-current/20" />
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}
