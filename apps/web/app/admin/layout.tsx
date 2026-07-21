import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { Sidebar } from '#components/client/shell/sidebar';
import { TopBar } from '#components/server/shell/top-bar';
import { decodeAccessTokenClaims } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveShellProfile } from '#lib/shell/shell-profile';

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  const profile = resolveShellProfile(claims);
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-h-screen flex-col pl-sidebar">
        <TopBar profile={profile} />
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto w-full max-w-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
