import { cookies } from 'next/headers';
import Link from 'next/link';
import { Button, Icon } from '@hms/ui';

import { CurrentDateChip } from '#components/server/dashboard/current-date-chip';
import { PageHeader } from '#components/shared/page-header';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { buildDashboardGreeting } from '#lib/dashboard/greeting';
import { FACILITY_CONFIG } from '#lib/facility/facility-config';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';
import { resolveShellProfile } from '#lib/shell/shell-profile';

export async function DashboardHeader() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, refreshToken });
  const profile = resolveShellProfile(claims);
  const metadata = ADMIN_ROUTE_METADATA.dashboard;
  const greeting = buildDashboardGreeting({
    displayName: profile.displayName,
    facilityName: FACILITY_CONFIG.name,
    date: new Date(),
  });
  return (
    <PageHeader
      title={metadata.title}
      subtitle={greeting}
      breadcrumbs={metadata.breadcrumbs}
      actions={
        <>
          <CurrentDateChip date={new Date()} />
          <Button asChild>
            <Link href="/admin/registrations?new=1">
              <Icon name="add" size={18} />
              New Case
            </Link>
          </Button>
        </>
      }
    />
  );
}
