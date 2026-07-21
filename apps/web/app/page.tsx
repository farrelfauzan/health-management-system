import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { decodeAccessTokenClaims, isAccessTokenExpired } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';

export default async function HomePage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;

  if (!isAccessTokenExpired(claims)) {
    redirect('/admin/dashboard');
  }

  redirect('/login');
}
