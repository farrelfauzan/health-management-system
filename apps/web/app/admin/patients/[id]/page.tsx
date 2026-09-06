import { cookies } from 'next/headers';

import { PatientDetailPanel } from '#components/client/patients/patient-detail-panel';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';

type AdminPatientDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * The SATUSEHAT entitlement is resolved here rather than in the panel: it
 * lives on the session claims, which a client component cannot read, and the
 * manual link control (P10-T12) must not render for a clinic that has not
 * bought the integration. Visibility only — `FeatureGuard` refuses the
 * endpoint whatever the page decided.
 */
export default async function AdminPatientDetailPage({ params }: AdminPatientDetailPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const claims = resolveSessionClaims({
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value,
    sessionHint: cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value,
  });

  return (
    <PatientDetailPanel
      patientId={id}
      isSatusehatEnabled={isFeatureEnabled(claims, 'satusehat')}
    />
  );
}
