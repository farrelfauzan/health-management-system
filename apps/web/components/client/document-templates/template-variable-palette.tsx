'use client';

import { useMemo, useState } from 'react';
import type { TemplateVariable } from '@hms/shared-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { TemplateVariablePaletteItem } from '#components/client/document-templates/template-variable-palette-item';
import { filterTemplateVariables } from '#lib/document-templates/filter-template-variables';
import { groupTemplateVariables } from '#lib/document-templates/group-template-variables';
import { isInsertableTemplateVariable } from '#lib/document-templates/is-insertable-template-variable';

const KNOWN_GROUP_PREFIXES = [
  'clinic',
  'invoice',
  'patient',
  'encounter',
  'admission',
  'payment',
  'items',
] as const;

type KnownGroupPrefix = (typeof KNOWN_GROUP_PREFIXES)[number];

function isKnownGroupPrefix(prefix: string): prefix is KnownGroupPrefix {
  return (KNOWN_GROUP_PREFIXES as readonly string[]).includes(prefix);
}

type TemplateVariablePaletteProps = {
  variables: readonly TemplateVariable[];
  disabled: boolean;
  onInsert: (variable: TemplateVariable) => void;
};

/**
 * The searchable variable palette (FR-E1-03). Filtering is ours rather than
 * cmdk's so a query matches the sample value and both labels, not just the
 * rendered text; grouping follows the token prefix so the list reads like
 * the registry.
 */
export function TemplateVariablePalette({
  variables,
  disabled,
  onInsert,
}: TemplateVariablePaletteProps) {
  const t = useTranslations('operations.billing.templates.palette');
  const locale = useLocale();
  const [query, setQuery] = useState<string>('');
  const groups = useMemo(() => {
    const insertable = variables.filter(isInsertableTemplateVariable);
    return groupTemplateVariables(filterTemplateVariables(insertable, query));
  }, [variables, query]);

  function resolveGroupHeading(prefix: string): string {
    return isKnownGroupPrefix(prefix) ? t(`groups.${prefix}`) : prefix;
  }

  return (
    <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm">{t('title')}</CardTitle>
        <CardDescription className="text-xs">{t('hint')}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <Command shouldFilter={false} className="rounded-lg border border-slate-200">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
          />
          <CommandList className="max-h-96">
            <CommandEmpty>{t('empty')}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.prefix} heading={resolveGroupHeading(group.prefix)}>
                {group.variables.map((variable) => (
                  <TemplateVariablePaletteItem
                    key={variable.token}
                    variable={variable}
                    locale={locale}
                    disabled={disabled}
                    onInsert={onInsert}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CardContent>
    </Card>
  );
}
