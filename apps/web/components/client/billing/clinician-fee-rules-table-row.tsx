'use client';

import type { ClinicianFeeRuleView } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { formatClinicianFeeRuleValue } from '#lib/clinician-fees/format-clinician-fee-rule-value';

type ClinicianFeeRulesTableRowProps = {
  rule: ClinicianFeeRuleView;
  canWrite: boolean;
  onEdit: (rule: ClinicianFeeRuleView) => void;
  onDelete: (rule: ClinicianFeeRuleView) => void;
};

export function ClinicianFeeRulesTableRow({
  rule,
  canWrite,
  onEdit,
  onDelete,
}: ClinicianFeeRulesTableRowProps) {
  const t = useTranslations('operations.billing.fees');
  const tItemTypes = useTranslations('operations.billing.itemTypes');
  const target = rule.serviceTariffName ?? (rule.category ? tItemTypes(rule.category) : '—');

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 text-sm text-slate-800">
        <div>{target}</div>
        <div className="text-xs text-slate-500">
          {rule.serviceTariffCode ? `${rule.serviceTariffCode} · ` : ''}
          {t(`rules.levels.${rule.level}`)}
        </div>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">
        {rule.doctorName ?? t('rules.allClinicians')}
      </TableCell>
      <TableCell className="px-4 text-sm font-medium text-slate-900">
        {formatClinicianFeeRuleValue({
          mode: rule.mode,
          value: rule.value,
          perUnitLabel: t('perUnit'),
        })}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {rule.effectiveFrom} – {rule.effectiveTo ?? t('rules.openEnded')}
      </TableCell>
      <TableCell className="px-4 text-right">
        {canWrite ? (
          <RowActionsMenu
            actions={[
              { label: t('rules.edit'), icon: 'edit', onSelect: () => onEdit(rule) },
              {
                label: t('rules.delete'),
                icon: 'delete',
                isDestructive: true,
                onSelect: () => onDelete(rule),
              },
            ]}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
