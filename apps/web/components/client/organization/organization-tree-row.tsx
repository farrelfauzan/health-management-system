'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import type { FlatOrganizationUnit } from '#lib/organization/flatten-organization-tree';

/** Matches the 1rem step the indent guide is drawn at. */
const INDENT_STEP_REM = 1.25;

type OrganizationTreeRowProps = {
  row: FlatOrganizationUnit;
  canManage: boolean;
  onAddChild: (parent: OrganizationUnitTreeNode) => void;
  onEdit: (unit: OrganizationUnitTreeNode) => void;
  onMove: (unit: OrganizationUnitTreeNode) => void;
  onArchive: (unit: OrganizationUnitTreeNode) => void;
  onDelete: (unit: OrganizationUnitTreeNode) => void;
};

export function OrganizationTreeRow({
  row,
  canManage,
  onAddChild,
  onEdit,
  onMove,
  onArchive,
  onDelete,
}: OrganizationTreeRowProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const { unit, indent } = row;
  const isArchived = unit.archivedAt !== undefined;
  // An archived unit offers no edits. Its only lawful next step is a restore,
  // which this release does not have — so the menu says nothing rather than
  // offering actions the API would refuse.
  const actions = canManage
    ? [
        ...(isArchived
          ? []
          : [
              { label: t('addChild'), icon: 'add', onSelect: () => onAddChild(unit) },
              { label: common('edit'), icon: 'edit', onSelect: () => onEdit(unit) },
              { label: t('move'), icon: 'drive_file_move', onSelect: () => onMove(unit) },
              {
                label: t('archive'),
                icon: 'archive',
                isDestructive: true,
                onSelect: () => onArchive(unit),
              },
            ]),
        {
          label: t('delete'),
          icon: 'delete_forever',
          isDestructive: true,
          onSelect: () => onDelete(unit),
        },
      ]
    : [];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 text-sm text-slate-800">
        <span
          className="flex items-center gap-2"
          style={{ paddingLeft: `${indent * INDENT_STEP_REM}rem` }}
        >
          {indent > 0 ? (
            <span aria-hidden className="text-slate-300">
              └
            </span>
          ) : null}
          <span className={isArchived ? 'text-slate-400 line-through' : undefined}>{unit.name}</span>
          {isArchived ? (
            <Badge variant="outline" className="text-slate-500">
              {t('archivedBadge')}
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{t(`kinds.${unit.kind}`)}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{unit.depth}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{unit.memberCount}</TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={common('actionsFor', { name: unit.name })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
