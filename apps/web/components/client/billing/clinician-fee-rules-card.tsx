'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicianFeeRuleView } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  toast,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeRuleFormDialog } from '#components/client/billing/clinician-fee-rule-form-dialog';
import { ClinicianFeeRulesTable } from '#components/client/billing/clinician-fee-rules-table';
import { ConfirmDialog } from '#components/client/shared/confirm-dialog';
import { clinicianFeeRuleControllerDeleteRuleV1 } from '#lib/api/generated/clinician-fees/clinician-fees';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateClinicianFeeQueries } from '#lib/clinician-fees/invalidate-clinician-fee-queries';
import { useClinicianFeeRules } from '#lib/clinician-fees/use-clinician-fee-rules';

type RuleDialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; rule: ClinicianFeeRuleView }
  | { kind: 'delete'; rule: ClinicianFeeRuleView };

/** The jasa medis rules (P27-T06): list, create, edit and delete. */
export function ClinicianFeeRulesCard() {
  const t = useTranslations('operations.billing.fees.rules');
  const tCommon = useTranslations('operations.common');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'ClinicianFee');
  const { rules, isPending, isError } = useClinicianFeeRules();
  const [dialog, setDialog] = useState<RuleDialogState>({ kind: 'closed' });
  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => clinicianFeeRuleControllerDeleteRuleV1(ruleId),
  });
  const closeDialog = (): void => setDialog({ kind: 'closed' });

  async function handleDelete(rule: ClinicianFeeRuleView): Promise<void> {
    try {
      parseApiSuccess(await deleteMutation.mutateAsync(rule.id), t('deleteError'));
      await invalidateClinicianFeeQueries(queryClient);
      toast.success(t('deleted'));
      closeDialog();
    } catch (caughtError) {
      notifyApiError(caughtError, t('deleteError'));
    }
  }

  return (
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
              {t('new')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <ClinicianFeeRulesTable
          rules={rules}
          isPending={isPending}
          isError={isError}
          canWrite={canWrite}
          onEdit={(rule) => setDialog({ kind: 'edit', rule })}
          onDelete={(rule) => setDialog({ kind: 'delete', rule })}
        />
      </CardContent>
      {dialog.kind === 'create' || dialog.kind === 'edit' ? (
        <ClinicianFeeRuleFormDialog
          rule={dialog.kind === 'edit' ? dialog.rule : null}
          onClose={closeDialog}
        />
      ) : null}
      <ConfirmDialog
        open={dialog.kind === 'delete'}
        onOpenChange={(open) => (open ? undefined : closeDialog())}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        cancelLabel={tCommon('cancel')}
        isDestructive
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (dialog.kind === 'delete') {
            void handleDelete(dialog.rule);
          }
        }}
      />
    </Card>
  );
}
