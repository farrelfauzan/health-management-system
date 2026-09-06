'use client';

import type { LabPanelView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type LabPanelRowProps = {
  labPanel: LabPanelView;
};

export function LabPanelRow({ labPanel }: LabPanelRowProps) {
  const t = useTranslations('operations.laboratory');

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{labPanel.code}</TableCell>
      <TableCell>{labPanel.name}</TableCell>
      <TableCell>
        {/* In report order, which is the order the panel was defined in — a
            darah rutin that printed its tests alphabetically would not read
            the way a clinician expects. */}
        <ol className="space-y-0.5 text-xs text-slate-600">
          {labPanel.members.map((member) => (
            <li key={member.labTestId}>
              <span className="font-mono text-slate-500">{member.code}</span> {member.name}
            </li>
          ))}
        </ol>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {labPanel.price === undefined ? (
          <span className="text-xs text-slate-400">{t('unpriced')}</span>
        ) : (
          formatRupiah(labPanel.price)
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            labPanel.isActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }
        >
          {labPanel.isActive ? t('active') : t('inactive')}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
