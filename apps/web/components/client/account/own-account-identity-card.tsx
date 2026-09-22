'use client';

import type { OwnAccountRecord } from '@hms/shared-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

type OwnAccountIdentityCardProps = {
  account: OwnAccountRecord;
};

/**
 * What the clinic asserts about the account, read-only: the name an
 * administrator typed and the sign-in address. Shown beside the form so it is
 * plain which is which and who to ask about the rest (D-027).
 */
export function OwnAccountIdentityCard({ account }: OwnAccountIdentityCardProps) {
  const t = useTranslations('operations.account');
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('identity.title')}
        </CardTitle>
        <CardDescription>{t('identity.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-heading text-xs text-slate-600">{t('identity.fullName')}</dt>
            <dd className="text-slate-900">{account.fullName ?? t('identity.unnamed')}</dd>
          </div>
          <div>
            <dt className="font-heading text-xs text-slate-600">{t('identity.email')}</dt>
            <dd className="text-slate-900">{account.email}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
