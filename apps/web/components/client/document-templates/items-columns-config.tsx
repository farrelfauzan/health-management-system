'use client';

import {
  INVOICE_ITEM_COLUMN_TOKENS,
  type InvoiceItemColumnToken,
  type TemplateVariable,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Icon,
  Label,
  cn,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { resolveTemplateVariableLabel } from '#lib/document-templates/resolve-template-variable-label';

type ItemsColumnsConfigProps = {
  value: readonly InvoiceItemColumnToken[];
  variables: readonly TemplateVariable[];
  disabled: boolean;
  isHighlighted: boolean;
  onChange: (next: InvoiceItemColumnToken[]) => void;
};

/**
 * Column inclusion and order for the `items` repeating block (FR-E1-04).
 * Included columns are listed first in print order with move buttons;
 * excluded ones follow. The last included column cannot be removed — a
 * table with no columns is not a layout choice, it is a broken invoice.
 */
export function ItemsColumnsConfig({
  value,
  variables,
  disabled,
  isHighlighted,
  onChange,
}: ItemsColumnsConfigProps) {
  const t = useTranslations('operations.billing.templates.itemsColumns');
  const locale = useLocale();
  const excluded = INVOICE_ITEM_COLUMN_TOKENS.filter((token) => !value.includes(token));
  const ordered: readonly InvoiceItemColumnToken[] = [...value, ...excluded];
  const isLastIncluded = value.length === 1;

  function resolveLabel(token: InvoiceItemColumnToken): string {
    const variable = variables.find((candidate) => candidate.token === token);
    return variable ? resolveTemplateVariableLabel(variable, locale) : token;
  }

  function toggleColumn(token: InvoiceItemColumnToken, isChecked: boolean): void {
    if (isChecked) {
      onChange([...value, token]);
      return;
    }
    onChange(value.filter((candidate) => candidate !== token));
  }

  function moveColumn(token: InvoiceItemColumnToken, offset: -1 | 1): void {
    const index = value.indexOf(token);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= value.length) {
      return;
    }
    const next = [...value];
    next.splice(index, 1);
    next.splice(target, 0, token);
    onChange(next);
  }

  return (
    <Card
      className={cn(
        'gap-0 rounded-xl border-slate-200 py-0 shadow-none',
        isHighlighted && 'ring-2 ring-primary/40',
      )}
      data-testid="items-columns-config"
    >
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm">{t('title')}</CardTitle>
        <CardDescription className="text-xs">{t('hint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 px-4 pb-4">
        {ordered.map((token) => {
          const isIncluded = value.includes(token);
          const label = resolveLabel(token);
          const position = value.indexOf(token);
          return (
            <div key={token} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
              <Checkbox
                id={`items-column-${token}`}
                checked={isIncluded}
                disabled={disabled || (isIncluded && isLastIncluded)}
                aria-label={t('include', { label })}
                onCheckedChange={(checked) => toggleColumn(token, checked === true)}
              />
              <Label
                htmlFor={`items-column-${token}`}
                className={cn('flex-1 text-sm', !isIncluded && 'text-slate-400')}
              >
                {label}
              </Label>
              {isIncluded ? (
                <span className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('moveUp', { label })}
                    disabled={disabled || position === 0}
                    onClick={() => moveColumn(token, -1)}
                  >
                    <Icon name="arrow_upward" size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('moveDown', { label })}
                    disabled={disabled || position === value.length - 1}
                    onClick={() => moveColumn(token, 1)}
                  >
                    <Icon name="arrow_downward" size={16} />
                  </Button>
                </span>
              ) : null}
            </div>
          );
        })}
        {isLastIncluded ? <p className="pt-1 text-xs text-slate-500">{t('lastColumn')}</p> : null}
      </CardContent>
    </Card>
  );
}
