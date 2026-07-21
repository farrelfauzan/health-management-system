import { AppointmentsPanel } from '#components/client/appointments/appointments-panel';
import { parseAppointmentsSearchParams } from '#lib/appointments/search-params';

type AdminAppointmentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAppointmentsPage({
  searchParams,
}: AdminAppointmentsPageProps) {
  const query = parseAppointmentsSearchParams(await searchParams);

  return <AppointmentsPanel initialQuery={query} />;
}
