import { EncountersPanel } from '#components/client/encounters/encounters-panel';
import { parseEncountersSearchParams } from '#lib/encounters/search-params';

type DoctorEncountersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorEncountersPage({ searchParams }: DoctorEncountersPageProps) {
  const query = parseEncountersSearchParams(await searchParams);

  // The API scopes this list to the doctor's own encounters via
  // `encounter.read:own`, so no client-side doctor filter is needed here.
  return <EncountersPanel initialQuery={query} basePath="/doctor/encounters" />;
}
