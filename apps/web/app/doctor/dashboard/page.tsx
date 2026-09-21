import { cookies } from 'next/headers';

import { DoctorTodayPanel } from '#components/client/encounters/doctor-today-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';
import { resolveClinicToday } from '#lib/shared/clinic-today';

export default async function DoctorDashboardPage() {
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });

  // Resolved on the server so a browser in another timezone cannot decide
  // which clinic day "today" means. The maternal-care entitlement lives on
  // the session claims, which a client component cannot read (P25-T14).
  return (
    <DoctorTodayPanel
      today={resolveClinicToday()}
      isMaternalCareEnabled={isFeatureEnabled(claims, 'maternal-care')}
    />
  );
}
