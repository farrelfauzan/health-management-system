import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button, Icon } from '@hms/ui';

import { CurrentDateChip } from '#components/server/dashboard/current-date-chip';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveDashboardDayPart } from '#lib/dashboard/greeting';
import { FACILITY_CONFIG } from '#lib/facility/facility-config';
import { resolveShellProfile } from '#lib/shell/shell-profile';

export async function DashboardHeader() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, refreshToken });
  const profile = resolveShellProfile(claims);
  const t = await getTranslations('dashboard.header');
  const date = new Date();
  const greeting = t(`greeting.${resolveDashboardDayPart(date.getHours())}`, {
    displayName: profile.displayName,
    facilityName: FACILITY_CONFIG.name,
  });
  return (
    <PageHeader
      title={t('title')}
      subtitle={greeting}
      breadcrumbs={[t('breadcrumbs.dashboard'), t('breadcrumbs.overview')]}
      actions={
        <>
          <CurrentDateChip date={date} />
          <Button asChild>
            <Link href="/admin/registrations?new=1">
              <Icon name="add" size={18} />
              {t('newCase')}
            </Link>
          </Button>
        </>
      }
    />
  );
}
