'use client';

import { useState } from 'react';
import type { TaxCodeView } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxCategoryDefaultsCard } from '#components/client/taxes/tax-category-defaults-card';
import { TaxCodeFormDialog } from '#components/client/taxes/tax-code-form-dialog';
import { TaxCodeRateDialog } from '#components/client/taxes/tax-code-rate-dialog';
import { TaxCodesTable } from '#components/client/taxes/tax-codes-table';
import { useTaxCodes } from '#lib/taxes/use-tax-codes';

type TaxCodeDialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; taxCode: TaxCodeView }
  | { kind: 'rate'; taxCode: TaxCodeView };

/**
 * Tax codes and their rates (P27-T03). System codes come seeded; a clinic adds
 * its own for anything they do not describe. A rate change is a new rate from
 * its date, never an edit, so issued invoices keep the rate they were issued at.
 */
export function TaxCodesPanel() {
  const t = useTranslations('operations.taxes.codes');
  const ability = useAbility();
  const canWrite = ability.can('write', 'TaxCode');
  const { taxCodes, isPending, isError } = useTaxCodes();
  const [dialog, setDialog] = useState<TaxCodeDialogState>({ kind: 'closed' });
  const closeDialog = (): void => setDialog({ kind: 'closed' });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
            {canWrite ? (
              <Button
                type="button"
                className="bg-primary-container hover:bg-primary"
                onClick={() => setDialog({ kind: 'create' })}
              >
                <Icon name="add" size={18} />
                {t('add')}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <TaxCodesTable
            taxCodes={taxCodes}
            isPending={isPending}
            isError={isError}
            canWrite={canWrite}
            onEdit={(taxCode) => setDialog({ kind: 'edit', taxCode })}
            onAddRate={(taxCode) => setDialog({ kind: 'rate', taxCode })}
          />
        </CardContent>
      </Card>
      <TaxCategoryDefaultsCard taxCodes={taxCodes} canWrite={canWrite} />
      {dialog.kind === 'create' || dialog.kind === 'edit' ? (
        <TaxCodeFormDialog
          taxCode={dialog.kind === 'edit' ? dialog.taxCode : undefined}
          onClose={closeDialog}
        />
      ) : null}
      {dialog.kind === 'rate' ? (
        <TaxCodeRateDialog taxCode={dialog.taxCode} onClose={closeDialog} />
      ) : null}
    </div>
  );
}
