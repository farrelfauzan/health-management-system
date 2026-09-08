import { cookies } from 'next/headers';

import { EncounterWorkspace } from '#components/client/encounters/encounter-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminEncounterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminEncounterDetailPage({ params }: AdminEncounterDetailPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });

  return (
    <EncounterWorkspace
      encounterId={id}
      isLaboratoryEnabled={isFeatureEnabled(claims, 'laboratory')}
    />
  );
}
