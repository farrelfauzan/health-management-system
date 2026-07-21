import { RegistrationsQueuePanel } from '#components/client/registrations/registrations-queue-panel';
import { parseRegistrationsSearchParams } from '#lib/registrations/search-params';

type PortalRegistrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PortalRegistrationsPage({
  searchParams,
}: PortalRegistrationsPageProps) {
  const query = parseRegistrationsSearchParams(await searchParams);
  return <RegistrationsQueuePanel initialQuery={query} variant="patient" />;
}
