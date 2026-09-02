'use client';

import type { TemplateVariable } from '@hms/shared-types';
import { CommandItem } from '@hms/ui';

import { resolveTemplateVariableLabel } from '#lib/document-templates/resolve-template-variable-label';

type TemplateVariablePaletteItemProps = {
  variable: TemplateVariable;
  locale: string;
  disabled: boolean;
  onInsert: (variable: TemplateVariable) => void;
};

export function TemplateVariablePaletteItem({
  variable,
  locale,
  disabled,
  onInsert,
}: TemplateVariablePaletteItemProps) {
  return (
    <CommandItem
      value={variable.token}
      disabled={disabled}
      onSelect={() => onInsert(variable)}
      className="flex-col items-start gap-0.5"
      data-testid={`palette-item-${variable.token}`}
    >
      <span className="text-sm font-medium text-slate-900">
        {resolveTemplateVariableLabel(variable, locale)}
      </span>
      <span className="flex w-full items-baseline justify-between gap-2">
        <code className="font-mono text-[11px] text-slate-500">{`{{${variable.token}}}`}</code>
        <span className="truncate text-[11px] text-slate-400">{variable.sample}</span>
      </span>
    </CommandItem>
  );
}
