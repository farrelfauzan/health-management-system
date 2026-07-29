import { AppointmentsPanel } from '#components/client/appointments/appointments-panel';
import { parseAppointmentsSearchParams } from '#lib/appointments/search-params';

type DoctorAppointmentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorAppointmentsPage({
  searchParams,
}: DoctorAppointmentsPageProps) {
  const query = parseAppointmentsSearchParams(await searchParams);

  // Scoped to the doctor's own appointments by `appointment.read:own`.
  return <AppointmentsPanel initialQuery={query} />;
}
