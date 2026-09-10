import { PatientsDirectoryPanel } from '#components/client/patients/patients-directory-panel';
import { parsePatientsSearchParams } from '#lib/patients/search-params';

type AdminPatientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPatientsPage({ searchParams }: AdminPatientsPageProps) {
  const query = parsePatientsSearchParams(await searchParams);

  return <PatientsDirectoryPanel initialQuery={query} />;
}
