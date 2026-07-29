import { EncountersPanel } from '#components/client/encounters/encounters-panel';
import { parseEncountersSearchParams } from '#lib/encounters/search-params';

type AdminEncountersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminEncountersPage({ searchParams }: AdminEncountersPageProps) {
  const raw = await searchParams;
  const query = parseEncountersSearchParams(raw);

  return <EncountersPanel initialQuery={query} />;
}
