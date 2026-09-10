import { PatientsWorkspace } from '#components/client/patients/patients-workspace';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';
import { PATIENTS_TABS } from '#lib/patients/patients-tabs';
import { parsePatientsSearchParams } from '#lib/patients/search-params';

type AdminPatientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPatientsPage({ searchParams }: AdminPatientsPageProps) {
  const params = await searchParams;
  const query = parsePatientsSearchParams(params);

  return (
    <PatientsWorkspace
      initialQuery={query}
      initialTab={parseTabSearchParam(params.tab, PATIENTS_TABS)}
    />
  );
}
