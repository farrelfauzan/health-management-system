'use client';

import * as React from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { TriangleAlert } from 'lucide-react';

import { findRichTextVariable } from '#lib/rich-text/find-rich-text-variable';
import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';
import { cn } from '#lib/utils';

type VariableChipOptions = {
  variables?: readonly RichTextVariableDefinition[];
};

/**
 * Editor-only rendering of an inline variable chip. The label comes from the
 * registry the editor was configured with; a token the registry no longer
 * knows renders in a visibly broken state with the token shown verbatim —
 * blocking that at publish time is `P16-T12`'s job, the editor's job is to
 * make it impossible to miss.
 */
export function RichTextVariableChipView(props: NodeViewProps): React.JSX.Element {
  const token = String(props.node.attrs.token ?? '');
  const options = props.extension.options as VariableChipOptions;
  const variable = findRichTextVariable(options.variables ?? [], token);
  const isUnknown = variable === undefined;
  return (
    <NodeViewWrapper
      as="span"
      data-testid="variable-chip"
      data-token={token}
      data-state={isUnknown ? 'unknown' : 'known'}
      title={isUnknown ? `Unknown variable: ${token}` : token}
      className={cn(
        'mx-0.5 inline-flex select-none items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs font-medium leading-tight',
        isUnknown
          ? 'border-amber-400 bg-amber-50 text-amber-900'
          : 'border-primary/30 bg-primary/10 text-primary',
        props.selected && 'ring-2 ring-ring',
      )}
    >
      {isUnknown ? <TriangleAlert className="size-3" aria-hidden /> : null}
      <span>{isUnknown ? token : variable.label}</span>
    </NodeViewWrapper>
  );
}
