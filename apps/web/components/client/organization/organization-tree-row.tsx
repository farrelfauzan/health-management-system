'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { Badge, Icon, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import type { OrganizationRow } from '#lib/organization/organization-row';

/** One indent step per level, matching the disclosure control's width. */
const INDENT_STEP_REM = 1.25;

type OrganizationTreeRowProps = {
  row: OrganizationRow;
  siblingCount: number;
  siblingPosition: number;
  isFocusable: boolean;
  onFocusRow: () => void;
  canManage: boolean;
  onAddChild: (parent: OrganizationUnitTreeNode) => void;
  onEdit: (unit: OrganizationUnitTreeNode) => void;
  onMove: (unit: OrganizationUnitTreeNode) => void;
  onArchive: (unit: OrganizationUnitTreeNode) => void;
  onDelete: (unit: OrganizationUnitTreeNode) => void;
  onViewMembers: (unit: OrganizationUnitTreeNode) => void;
};

export function OrganizationTreeRow({
  row,
  siblingCount,
  siblingPosition,
  isFocusable,
  onFocusRow,
  canManage,
  onAddChild,
  onEdit,
  onMove,
  onArchive,
  onDelete,
  onViewMembers,
}: OrganizationTreeRowProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const unit = row.original;
  const isArchived = unit.archivedAt !== undefined;
  const canExpand = row.getCanExpand();
  const isExpanded = row.getIsExpanded();
  // Viewing members is available to anyone who can see the chart, archived
  // units included. Every other action needs `manage`.
  const liveUnitActions =
    canManage && !isArchived
      ? [
          { label: t('addChild'), icon: 'add', onSelect: () => onAddChild(unit) },
          { label: common('edit'), icon: 'edit', onSelect: () => onEdit(unit) },
          { label: t('move'), icon: 'drive_file_move', onSelect: () => onMove(unit) },
          {
            label: t('archive'),
            icon: 'archive',
            isDestructive: true,
            onSelect: () => onArchive(unit),
          },
        ]
      : [];
  const actions = [
    { label: t('members'), icon: 'group', onSelect: () => onViewMembers(unit) },
    ...liveUnitActions,
    ...(canManage
      ? [
          {
            label: t('delete'),
            icon: 'delete_forever',
            isDestructive: true,
            onSelect: () => onDelete(unit),
          },
        ]
      : []),
  ];

  return (
    <TableRow
      data-tree-row
      // `aria-level` is 1-based and matches the depth the API computes, so the
      // number a screen reader announces is the same one the Level column shows.
      aria-level={unit.depth}
      aria-posinset={siblingPosition}
      aria-setsize={siblingCount}
      // Only set on rows that actually have children: `aria-expanded="false"` on
      // a leaf tells a screen reader there is something to open when there is
      // not.
      {...(canExpand ? { 'aria-expanded': isExpanded } : {})}
      tabIndex={isFocusable ? 0 : -1}
      onFocus={onFocusRow}
      className="transition-colors hover:bg-slate-50 focus:bg-slate-100 focus:outline-2 focus:-outline-offset-2 focus:outline-slate-400"
    >
      <TableCell className="px-4 py-3 text-sm text-slate-800">
        <span
          className="flex items-center gap-1"
          style={{ paddingLeft: `${row.depth * INDENT_STEP_REM}rem` }}
        >
          {canExpand ? (
            <button
              type="button"
              // -1 because the row owns the tab stop and the arrow keys own the
              // expansion; this exists for pointer users and stays out of the
              // keyboard path rather than doubling every stop.
              tabIndex={-1}
              aria-hidden
              className="flex size-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              onClick={row.getToggleExpandedHandler()}
            >
              <Icon name={isExpanded ? 'expand_more' : 'chevron_right'} size={18} />
            </button>
          ) : (
            <span aria-hidden className="size-5" />
          )}
          <span className={isArchived ? 'text-slate-400 line-through' : undefined}>{unit.name}</span>
          {isArchived ? (
            <Badge variant="outline" className="ml-1 text-slate-500">
              {t('archivedBadge')}
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{t(`kinds.${unit.kind}`)}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{unit.depth}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{unit.memberCount}</TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={common('actionsFor', { name: unit.name })}
        />
      </TableCell>
    </TableRow>
  );
}
