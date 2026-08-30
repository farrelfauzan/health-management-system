'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { Badge, cn, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type OrganizationChartNodeProps = {
  unit: OrganizationUnitTreeNode;
  /** Roots draw no connector up — there is nothing above them. */
  isRoot: boolean;
  onSelectUnit: (unit: OrganizationUnitTreeNode) => void;
};

/**
 * One box of the family-tree diagram (SJ-91), recursing into its children.
 *
 * The connectors are the classic nested-list org chart drawn entirely in
 * Tailwind pseudo-elements, so no chart library enters the dependency tree for
 * a structure capped at six levels:
 *
 * - `before:` on each non-root node is the horizontal rail along the top of a
 *   sibling row. Every node draws the segment across its own width; the first
 *   child keeps only its right half and the last child only its left, which is
 *   what turns the segments into one rail with clean ends. An only child shows
 *   none — its drop line needs no rail.
 * - `after:` is the short vertical drop from that rail down to the node's card.
 * - The parent's own drop to the rail is the explicit `<span>` below its card.
 *
 * The card is a button whose one action is opening the members dialog: the
 * natural question when looking at a box is "who is in it". Everything else —
 * rename, move, archive — stays in the list view, so the two surfaces cannot
 * drift apart.
 */
export function OrganizationChartNode({ unit, isRoot, onSelectUnit }: OrganizationChartNodeProps) {
  const t = useTranslations('operations.organization');
  const isArchived = unit.archivedAt !== undefined;

  return (
    <li
      className={cn(
        'flex flex-col items-center px-2',
        !isRoot &&
          "relative pt-6 before:absolute before:top-0 before:right-0 before:left-0 before:h-px before:bg-slate-300 before:content-[''] first:before:left-1/2 last:before:right-1/2 only:before:hidden after:absolute after:top-0 after:left-1/2 after:h-6 after:w-px after:-translate-x-1/2 after:bg-slate-300 after:content-['']",
      )}
    >
      <button
        type="button"
        onClick={() => onSelectUnit(unit)}
        className={cn(
          'w-44 rounded-xl border bg-white px-3 py-2 text-left shadow-none transition-colors',
          isArchived
            ? 'border-slate-200 bg-slate-50'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-heading truncate text-sm font-semibold',
              isArchived ? 'text-slate-400 line-through' : 'text-slate-900',
            )}
          >
            {unit.name}
          </span>
          {isArchived ? (
            <Badge variant="outline" className="shrink-0 text-slate-500">
              {t('archivedBadge')}
            </Badge>
          ) : null}
        </span>
        <span className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{t(`kinds.${unit.kind}`)}</span>
          <span className="flex items-center gap-1">
            <Icon name="group" size={14} />
            {unit.memberCount}
          </span>
        </span>
      </button>
      {unit.children.length > 0 ? (
        <>
          <span aria-hidden className="h-6 w-px bg-slate-300" />
          <ul className="flex items-start">
            {unit.children.map((child) => (
              <OrganizationChartNode
                key={child.id}
                unit={child}
                isRoot={false}
                onSelectUnit={onSelectUnit}
              />
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}
