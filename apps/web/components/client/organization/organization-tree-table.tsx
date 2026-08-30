'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import type { ExpandedState } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { OrganizationTreeRow } from '#components/client/organization/organization-tree-row';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { buildDefaultExpandedState } from '#lib/organization/build-default-expanded-state';
import { findTypeaheadMatch } from '#lib/organization/find-typeahead-match';
import type { OrganizationRow } from '#lib/organization/organization-row';
import { organizationTableFeatures } from '#lib/organization/organization-table-features';
import { resolveTreeKeyAction } from '#lib/organization/resolve-tree-key-action';

const TABLE_COLUMN_COUNT = 5;

type OrganizationTreeTableProps = {
  roots: OrganizationUnitTreeNode[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  onAddChild: (parent: OrganizationUnitTreeNode) => void;
  onEdit: (unit: OrganizationUnitTreeNode) => void;
  onMove: (unit: OrganizationUnitTreeNode) => void;
  onArchive: (unit: OrganizationUnitTreeNode) => void;
  onDelete: (unit: OrganizationUnitTreeNode) => void;
  onViewMembers: (unit: OrganizationUnitTreeNode) => void;
};

/**
 * The org chart as a treegrid (SJ-90).
 *
 * `role="treegrid"` rather than `role="tree"`: the rows genuinely have columns —
 * kind, level, member count — and a plain tree would leave a screen reader with
 * no way to announce them. That column structure is also why this stayed a
 * table rather than becoming nested lists, and why TanStack Table is the engine:
 * `getSubRows` + `getExpandedRowModel` give the hierarchy while the alignment
 * that made the flat version readable survives untouched.
 *
 * What TanStack does *not* give, and is therefore written out here: the ARIA
 * semantics and the keyboard model. Both are the point of this screen for anyone
 * not using a mouse.
 */
export function OrganizationTreeTable({
  roots,
  isPending,
  isError,
  canManage,
  onAddChild,
  onEdit,
  onMove,
  onArchive,
  onDelete,
  onViewMembers,
}: OrganizationTreeTableProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  // Null means "nobody has touched the chart yet", so the default is derived
  // rather than seeded. Seeding in `useState` would capture an empty tree on the
  // first render and leave every root collapsed once the query resolved.
  //
  // In-memory only, deliberately. This survives the refetch after a mutation,
  // which is the case that matters — a reorganisation should not re-collapse the
  // branch someone is working in. It does not survive a reload, because SJ-9's
  // storage audit holds the line that nothing about a session persists on a
  // shared clinic terminal, and "which branches were open" is not worth being
  // the second exception to that rule.
  const [expandedOverride, setExpandedOverride] = useState<ExpandedState | null>(null);
  const expanded = expandedOverride ?? buildDefaultExpandedState(roots);
  const setExpanded = setExpandedOverride;
  // Roving tabindex: exactly one row is tabbable, so the treegrid is a single
  // tab stop and the arrows do the rest — otherwise a 200-unit chart would be
  // 200 stops between the toolbar and whatever follows it.
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const table = useTable(
    {
      features: organizationTableFeatures,
      columns: [],
      data: roots,
      state: { expanded },
      onExpandedChange: (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) =>
        setExpanded(typeof updater === 'function' ? updater(expanded) : updater),
      getSubRows: (unit: OrganizationUnitTreeNode) => unit.children,
      // Stable ids, so the persisted expanded set survives a rename or a
      // reorder. TanStack's default is an index path, which would reopen a
      // different branch after either.
      getRowId: (unit: OrganizationUnitTreeNode) => unit.id,
      // Required, despite there being no pagination here. The expanded row model
      // defers flattening to the pagination model unless this is set, so with
      // pagination absent it would return the unexpanded rows and no child would
      // ever render.
      paginateExpandedRows: true,
    },
    (state) => state,
  );
  const visibleRows: OrganizationRow[] = table.getRowModel().rows;

  function focusRowAt(index: number): void {
    const clamped = Math.max(0, Math.min(index, visibleRows.length - 1));
    setFocusedIndex(clamped);
    const target = bodyRef.current?.querySelectorAll<HTMLElement>('[data-tree-row]')[clamped];
    target?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>): void {
    const row = visibleRows[focusedIndex];
    if (!row) {
      return;
    }
    const action = resolveTreeKeyAction(event.key, {
      canExpand: row.getCanExpand(),
      isExpanded: row.getIsExpanded(),
      hasParent: row.depth > 0,
    });
    if (action.kind === 'none') {
      return;
    }
    // Every handled key is one the browser would otherwise scroll or search
    // with, so preventing default is the point rather than a precaution.
    event.preventDefault();
    if (action.kind === 'expand' || action.kind === 'collapse') {
      row.toggleExpanded(action.kind === 'expand');
      return;
    }
    if (action.kind === 'focusNext') {
      focusRowAt(focusedIndex + 1);
      return;
    }
    if (action.kind === 'focusPrevious') {
      focusRowAt(focusedIndex - 1);
      return;
    }
    if (action.kind === 'focusFirst') {
      focusRowAt(0);
      return;
    }
    if (action.kind === 'focusLast') {
      focusRowAt(visibleRows.length - 1);
      return;
    }
    if (action.kind === 'focusParent') {
      const parentIndex = visibleRows.findIndex(
        (candidate) => candidate.id === row.parentId,
      );
      if (parentIndex >= 0) {
        focusRowAt(parentIndex);
      }
      return;
    }
    const match = findTypeaheadMatch(
      visibleRows.map((candidate) => candidate.original.name),
      focusedIndex,
      action.character,
    );
    if (match >= 0) {
      focusRowAt(match);
    }
  }

  if (!isPending && visibleRows.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'account_tree'}
        title={isError ? t('loadError') : t('empty')}
        description={
          isError
            ? t('loadErrorDescription')
            : canManage
              ? t('emptyDescription')
              : t('emptyReadOnly')
        }
      />
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <Table role="treegrid" aria-label={t('title')} className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('name')}
            </TableHead>
            <TableHead className="px-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('kind')}
            </TableHead>
            <TableHead className="px-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('level')}
            </TableHead>
            <TableHead className="px-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('members')}
            </TableHead>
            <TableHead className="px-4 text-right text-xs font-medium tracking-wide text-slate-500 uppercase">
              {common('actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef} onKeyDown={handleKeyDown}>
          {isPending ? (
            <TableSkeleton columns={TABLE_COLUMN_COUNT} />
          ) : (
            visibleRows.map((row, index) => (
              <OrganizationTreeRow
                key={row.id}
                row={row}
                // `aria-setsize` counts siblings, not visible rows: a screen
                // reader should hear "3 of 5 at level 2", not the row's offset
                // in a flattened list that happens to be what the DOM holds.
                siblingCount={countSiblings(row, visibleRows)}
                siblingPosition={resolveSiblingPosition(row, visibleRows)}
                isFocusable={index === focusedIndex}
                onFocusRow={() => setFocusedIndex(index)}
                canManage={canManage}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onMove={onMove}
                onArchive={onArchive}
                onDelete={onDelete}
                onViewMembers={onViewMembers}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function countSiblings(row: OrganizationRow, rows: OrganizationRow[]): number {
  return rows.filter((candidate) => candidate.parentId === row.parentId).length;
}

function resolveSiblingPosition(row: OrganizationRow, rows: OrganizationRow[]): number {
  const siblings = rows.filter((candidate) => candidate.parentId === row.parentId);
  return siblings.findIndex((candidate) => candidate.id === row.id) + 1;
}
