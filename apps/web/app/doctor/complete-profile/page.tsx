import { DoctorProfileCompletionPanel } from '#components/client/doctor-profile/doctor-profile-completion-panel';
import { DOCTOR_PROFILE_COMPLETION } from '#lib/doctor-profile/doctor-profile-completion';
import { resolveSafeCompletionNext } from '#lib/doctor-profile/resolve-safe-completion-next';

type DoctorCompleteProfilePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The profile-completion screen (P20-T02). `proxy.ts` pins a doctor with
 * required profile fields still empty here until they fill them in; who is
 * pinned is decided at session issuance, not on this page.
 */
export default async function DoctorCompleteProfilePage({
  searchParams,
}: DoctorCompleteProfilePageProps) {
  const next = (await searchParams)[DOCTOR_PROFILE_COMPLETION.nextParam];
  const nextPath = resolveSafeCompletionNext(typeof next === 'string' ? next : undefined);
  return <DoctorProfileCompletionPanel nextPath={nextPath} />;
}
