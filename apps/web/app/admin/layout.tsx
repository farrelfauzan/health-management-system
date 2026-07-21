import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@hms/ui';

import { AppSidebar } from '#components/client/shell/app-sidebar';
import { TopBar } from '#components/server/shell/top-bar';
import { decodeAccessTokenClaims } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveShellProfile } from '#lib/shell/shell-profile';

const SIDEBAR_STYLE: CSSProperties = { '--sidebar-width': '15rem' } as CSSProperties;

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  const profile = resolveShellProfile(claims);
  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <AppSidebar />
      <SidebarInset>
        <TopBar profile={profile} />
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto w-full max-w-page">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
