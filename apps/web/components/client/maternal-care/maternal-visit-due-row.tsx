'use client';

import type { ContraceptiveMethodValue, MaternalVisitDueItem } from '@hms/shared-types';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type MaternalVisitDueRowProps = {
  item: MaternalVisitDueItem;
  patientBasePath: string;
};

const REMINDER_CLASSES = {
  SENT: 'bg-emerald-50 text-emerald-800',
  FAILED: 'bg-danger-tint text-danger',
  pending: 'bg-slate-100 text-slate-600',
  noConsent: 'bg-slate-100 text-slate-500',
} as const;

function resolveReminderState(item: MaternalVisitDueItem): keyof typeof REMINDER_CLASSES {
  if (item.reminder !== null) return item.reminder.status;
  return item.hasReminderConsent ? 'pending' : 'noConsent';
}

/** One due visit: who, which schedule and visit, its window, and the reminder state. */
export function MaternalVisitDueRow({ item, patientBasePath }: MaternalVisitDueRowProps) {
  const t = useTranslations('maternalCare');
  const reminderState = resolveReminderState(item);
  const tab = item.source === 'FAMILY_PLANNING' ? 'family-planning' : 'pregnancy';
  const visitLabel =
    item.source === 'ANTENATAL'
      ? t('dueThisWeek.trimester', { number: item.code.slice(1) })
      : item.source === 'FAMILY_PLANNING'
        ? t(`familyPlanning.methods.${item.code as ContraceptiveMethodValue}`)
        : item.source === 'SHK'
          ? t('dueThisWeek.shkSample', { number: item.code.replace('SHK', '') })
          : item.code;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <Link
        href={`${patientBasePath}/${item.patientId}?tab=${tab}`}
        className="min-w-0 flex-1 font-medium text-slate-900 hover:underline"
      >
        {item.patientName}
        {item.medicalRecordNumber ? (
          <span className="ml-2 text-xs font-normal text-slate-400">
            {item.medicalRecordNumber}
          </span>
        ) : null}
      </Link>
      <span className="text-slate-600">
        {t(`dueThisWeek.sources.${item.source}`)} · {visitLabel}
        {item.subject === 'NEWBORN' ? ` · ${t('dueThisWeek.newborn')}` : ''}
      </span>
      <span className="text-slate-600">
        {item.dueFrom === item.dueUntil
          ? item.dueFrom
          : t('dueThisWeek.window', { from: item.dueFrom, until: item.dueUntil })}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${REMINDER_CLASSES[reminderState]}`}>
        {t(`dueThisWeek.reminder.${reminderState}`)}
      </span>
    </li>
  );
}
