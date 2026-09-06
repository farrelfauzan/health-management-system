'use client';

import type { DocumentTemplateView } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { StatusBadge } from '#components/shared/status-badge';

type DocumentTemplatesTableRowProps = {
  template: DocumentTemplateView;
  canWrite: boolean;
  isMutating: boolean;
  onEdit: (template: DocumentTemplateView) => void;
  onSetDefault: (template: DocumentTemplateView) => void;
  onArchive: (template: DocumentTemplateView) => void;
};

export function DocumentTemplatesTableRow({
  template,
  canWrite,
  isMutating,
  onEdit,
  onSetDefault,
  onArchive,
}: DocumentTemplatesTableRowProps) {
  const t = useTranslations('operations.billing.templates');
  const format = useFormatter();
  const latestVersion = template.latestPublishedVersion;
  const actions: RowAction[] = [
    {
      label: t('actions.setDefault'),
      icon: 'star',
      isDisabled: isMutating || template.isDefault || latestVersion === undefined,
      onSelect: () => onSetDefault(template),
    },
    {
      label: t('actions.archive'),
      icon: 'archive',
      isDestructive: true,
      // Reachable on the default template on purpose: the dialog explains
      // that another default must be chosen first, which a greyed-out item
      // never could.
      isDisabled: isMutating,
      onSelect: () => onArchive(template),
    },
  ];
  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{template.name}</p>
        {template.description ? (
          <p className="text-xs text-slate-500">{template.description}</p>
        ) : null}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={template.status} />
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {template.isDefault ? <Badge variant="secondary">{t('isDefault')}</Badge> : t('notDefault')}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {latestVersion
          ? t('versionNumber', { number: latestVersion.versionNumber })
          : t('notPublished')}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(template.updatedAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </TableCell>
      <TableCell className="px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(template)}>
            {t('actions.edit')}
          </Button>
          {canWrite ? <RowActionsMenu actions={actions} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
