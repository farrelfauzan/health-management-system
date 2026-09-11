'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { EMPTY_VALUE } from '#lib/shared/empty-value';

type DoctorAccountEmailNoticeProps = {
  email?: string;
  invitationStatus?: string;
};

/**
 * The doctor's sign-in address on the edit form: shown, never edited.
 *
 * Changing it is an Administration action on the account itself, because the
 * address belongs to the `User` row and is what they log in with — so this
 * points at that screen instead of offering a box that would write a second
 * copy. On create the same address is an ordinary input, which is the one
 * moment there is no account yet to disagree with. A doctor with no account
 * at all (P20-T01) has nothing for Administration to manage, so they are sent
 * to the directory's send-invitation action instead.
 */
export function DoctorAccountEmailNotice({
  email,
  invitationStatus,
}: DoctorAccountEmailNoticeProps) {
  const t = useTranslations('clinical');
  if (invitationStatus === 'NO_ACCOUNT') {
    return (
      <div className="space-y-1.5">
        <span className="block font-heading text-xs font-medium text-slate-600">
          {t('doctors.email')}
        </span>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-700">{email ?? EMPTY_VALUE}</span>
          <StatusBadge status={invitationStatus} />
        </div>
        <p className="text-xs text-slate-500">{t('doctors.form.emailNoAccount')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <span className="block font-heading text-xs font-medium text-slate-600">
        {t('doctors.email')}
      </span>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-700">{email ?? EMPTY_VALUE}</span>
        {invitationStatus ? <StatusBadge status={invitationStatus} /> : null}
      </div>
      <p className="text-xs text-slate-500">
        {t('doctors.form.emailReadOnly')}{' '}
        <Link
          href="/admin/administration?tab=users"
          className="font-medium text-primary underline underline-offset-2"
        >
          {t('doctors.form.emailManageLink')}
        </Link>
      </p>
    </div>
  );
}
