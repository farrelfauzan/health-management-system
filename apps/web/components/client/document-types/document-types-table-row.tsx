'use client';

import type { DocumentTypeView } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';

type DocumentTypesTableRowProps = {
  type: DocumentTypeView;
  canWrite: boolean;
  isMutating: boolean;
  onEdit: (type: DocumentTypeView) => void;
  onApprovers: (type: DocumentTypeView) => void;
  onToggleActive: (type: DocumentTypeView) => void;
  onDelete: (type: DocumentTypeView) => void;
};

/**
 * One type. The code sits under the name because handlers key on it and a
 * renamed system type must still be recognisable; the self-approval badge is
 * the persistent warning FR-E5-14 asks for, on the list as well as in the
 * form. Delete is offered on a system row on purpose: the dialog explains
 * why it is refused, which a greyed-out item never could.
 */
export function DocumentTypesTableRow({
  type,
  canWrite,
  isMutating,
  onEdit,
  onApprovers,
  onToggleActive,
  onDelete,
}: DocumentTypesTableRowProps) {
  const t = useTranslations('operations.documents.types');
  const parties = [
    type.requiresPatient ? t('parties.patient') : null,
    type.requiresDoctor ? t('parties.doctor') : null,
  ].filter((party): party is string => party !== null);
  const actions: RowAction[] = [
    { label: t('actions.approvers'), icon: 'how_to_reg', onSelect: () => onApprovers(type) },
    {
      label: type.isActive ? t('actions.deactivate') : t('actions.activate'),
      icon: type.isActive ? 'visibility_off' : 'visibility',
      isDisabled: isMutating,
      onSelect: () => onToggleActive(type),
    },
    {
      label: t('actions.delete'),
      icon: 'delete',
      isDestructive: true,
      isDisabled: isMutating,
      onSelect: () => onDelete(type),
    },
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{type.name}</p>
        <p className="font-mono text-xs text-slate-500">{type.code}</p>
        {type.description ? <p className="text-xs text-slate-500">{type.description}</p> : null}
        {type.behavior !== 'GENERIC' ? (
          <p className="mt-1 text-xs text-slate-500">{t(`behaviors.${type.behavior}`)}</p>
        ) : null}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {type.isApprovalRequired
          ? t('approvalRequired', { count: type.requiredApprovals })
          : t('approvalOff')}
        {type.allowSelfApproval ? (
          <Badge className="ml-2 border-transparent bg-warning-tint text-warning">
            {t('selfApprovalBadge')}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {parties.length === 0 ? t('parties.none') : parties.join(' · ')}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {t(`contentModes.${type.contentMode}`)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {t('documentCount', { count: type.documentCount })}
      </TableCell>
      <TableCell className="px-4">
        <div className="flex flex-wrap gap-1">
          {type.isSystem ? <Badge variant="secondary">{t('systemBadge')}</Badge> : null}
          {!type.isActive ? <Badge variant="outline">{t('inactiveBadge')}</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="px-4 text-right">
        {canWrite ? (
          <div className="flex items-center justify-end gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(type)}>
              {t('actions.edit')}
            </Button>
            <RowActionsMenu actions={actions} />
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
