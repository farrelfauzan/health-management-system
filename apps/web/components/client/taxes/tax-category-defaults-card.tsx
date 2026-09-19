'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TAX_DEFAULT_TARGETS,
  type TaxCategoryDefaultView,
  type TaxCodeView,
  type UpdateTaxCategoryDefaultsInput,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { taxCategoryDefaultControllerUpdateCategoryDefaultsV1 } from '#lib/api/generated/tax-codes/tax-codes';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateTaxCodeQueries } from '#lib/taxes/invalidate-tax-code-queries';
import { resolveTaxCodeErrorCode } from '#lib/taxes/resolve-tax-code-error-code';
import {
  toTaxDefaultSelection,
  type TaxDefaultSelection,
} from '#lib/taxes/to-tax-default-selection';
import { useTaxCategoryDefaults } from '#lib/taxes/use-tax-category-defaults';

type TaxCategoryDefaultsCardProps = {
  taxCodes: TaxCodeView[];
  canWrite: boolean;
};

/**
 * The code each tariff category and every medication falls back to (P27-T03).
 * Moving a default moves every item without an override of its own, so the
 * save sends only the targets that changed.
 */
export function TaxCategoryDefaultsCard({ taxCodes, canWrite }: TaxCategoryDefaultsCardProps) {
  const t = useTranslations('operations.taxes.defaults');
  const tCodes = useTranslations('operations.taxes.codes');
  const queryClient = useQueryClient();
  const { defaults, isPending, isError } = useTaxCategoryDefaults();
  const [selection, setSelection] = useState<TaxDefaultSelection>({});
  const [formError, setFormError] = useState<string | null>(null);
  const activeCodes = taxCodes.filter((code) => code.isActive);

  useEffect(() => {
    setSelection(toTaxDefaultSelection(defaults));
  }, [defaults]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateTaxCategoryDefaultsInput) =>
      taxCategoryDefaultControllerUpdateCategoryDefaultsV1(payload),
  });
  const stored = toTaxDefaultSelection(defaults);
  const changed = TAX_DEFAULT_TARGETS.filter(
    (target) => (selection[target] ?? '') !== (stored[target] ?? ''),
  );

  async function handleSave(): Promise<void> {
    setFormError(null);
    try {
      const response = await saveMutation.mutateAsync({
        defaults: changed.map((target) => ({ target, taxCodeId: selection[target] || null })),
      });
      parseApiSuccess<TaxCategoryDefaultView[]>(response, tCodes('saveError'));
      await invalidateTaxCodeQueries(queryClient);
      toast.success(t('saved'));
    } catch (caughtError) {
      const code = resolveTaxCodeErrorCode(caughtError);
      setFormError(
        code ? tCodes(`errors.${code}`) : notifyApiError(caughtError, tCodes('saveError')),
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? <Skeleton className="h-32 w-full" /> : null}
        {isError ? <InlineNotice tone="error">{t('loadError')}</InlineNotice> : null}
        {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
        {!isPending && !isError ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {TAX_DEFAULT_TARGETS.map((target) => (
              <div key={target} className="space-y-1">
                <FormLabel htmlFor={`tax-default-${target}`}>{t(`targets.${target}`)}</FormLabel>
                <Select
                  value={selection[target] ?? ''}
                  disabled={!canWrite || saveMutation.isPending}
                  onValueChange={(value) =>
                    setSelection((current) => ({ ...current, [target]: value }))
                  }
                >
                  <SelectTrigger id={`tax-default-${target}`} className="w-full">
                    <SelectValue placeholder={t('none')} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCodes.map((code) => (
                      <SelectItem key={code.id} value={code.id}>
                        {code.code} — {code.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}
        {canWrite ? (
          <Button
            type="button"
            className="bg-primary-container hover:bg-primary"
            disabled={changed.length === 0 || saveMutation.isPending}
            onClick={() => void handleSave()}
          >
            {t('save')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
