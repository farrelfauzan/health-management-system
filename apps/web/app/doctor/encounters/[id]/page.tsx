import { cookies } from 'next/headers';

import { EncounterWorkspace } from '#components/client/encounters/encounter-workspace';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type DoctorEncounterDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * The laboratory entitlement is resolved here rather than in the workspace: it
 * lives on the session claims, which a client component cannot read (P18-T07).
 * Visibility only — `FeatureGuard` refuses every laboratory endpoint for a
 * clinic without it whatever the page decided.
 */
export default async function DoctorEncounterDetailPage({
  params,
}: DoctorEncounterDetailPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });

  // No patient-link prefix: a doctor session has no patient directory route.
  return (
    <EncounterWorkspace
      encounterId={id}
      encountersHref="/doctor/encounters"
      patientHrefPrefix=""
      isLaboratoryEnabled={isFeatureEnabled(claims, 'laboratory')}
    />
  );
}
