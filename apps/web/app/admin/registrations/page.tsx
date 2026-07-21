import { RegistrationsQueuePanel } from '#components/client/registrations/registrations-queue-panel';
import { parseRegistrationsSearchParams } from '#lib/registrations/search-params';

type AdminRegistrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminRegistrationsPage({
  searchParams,
}: AdminRegistrationsPageProps) {
  const raw = await searchParams;
  const query = parseRegistrationsSearchParams(raw);
  const shouldOpenCreate = (Array.isArray(raw.new) ? raw.new[0] : raw.new) === '1';
  return (
    <RegistrationsQueuePanel
      initialQuery={query}
      variant="admin"
      openCreateOnMount={shouldOpenCreate}
    />
  );
}
