import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { hasAnyRole } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';

export default async function HomePage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, refreshToken });

  if (hasAnyRole(claims, ['SUPER_ADMIN', 'ADMIN'])) {
    redirect('/admin/dashboard');
  }

  if (hasAnyRole(claims, ['PATIENT'])) {
    redirect('/portal/registrations');
  }

  redirect('/login');
}
