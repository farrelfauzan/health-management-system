'use client';

import type { SatusehatLocationNode } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';

const INDENT_REM_PER_DEPTH = 1.25;

type SatusehatLocationRowProps = {
  node: SatusehatLocationNode;
  canWrite: boolean;
  isPending: boolean;
  onRegister: (node: SatusehatLocationNode) => void;
};

/**
 * One row of the Location tree (P24-T06). A registered row offers "Kirim
 * perubahan", which re-sends its current name and status — the way a rename or
 * a deactivation reaches SATUSEHAT. A blocked row offers nothing: its message
 * says what to fix first.
 */
export function SatusehatLocationRow({
  node,
  canWrite,
  isPending,
  onRegister,
}: SatusehatLocationRowProps) {
  const t = useTranslations('operations.integrations.satusehatLocations');
  const detail = node.satusehatLocationId ?? node.blockMessage ?? t('notRegistered');
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
      <div className="min-w-0" style={{ paddingLeft: `${node.depth * INDENT_REM_PER_DEPTH}rem` }}>
        <p className="text-sm font-medium text-slate-800">
          {node.name}
          {node.code ? (
            <span className="ml-2 font-mono text-xs text-slate-500">{node.code}</span>
          ) : null}
        </p>
        <p className="text-xs break-all text-slate-500">
          {t(`kind.${node.kind}`)}
          {node.isActive ? '' : ` · ${t('inactive')}`} · {detail}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={node.status} label={t(`status.${node.status}`)} />
        {canWrite && node.status !== 'BLOCKED' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => onRegister(node)}
          >
            {node.status === 'REGISTERED' ? t('push') : t('register')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
