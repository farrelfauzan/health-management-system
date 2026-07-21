import { PatientsDirectoryPanel } from '#components/client/patients/patients-directory-panel';
import { ActiveAlertCard } from '#components/server/patients/active-alert-card';
import { AdmissionTrendsCard } from '#components/server/patients/admission-trends-card';
import { parsePatientsSearchParams } from '#lib/patients/search-params';

type AdminPatientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPatientsPage({ searchParams }: AdminPatientsPageProps) {
  const query = parsePatientsSearchParams(await searchParams);

  return (
    <div className="space-y-6">
      <PatientsDirectoryPanel initialQuery={query} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <AdmissionTrendsCard />
        <ActiveAlertCard />
      </div>
    </div>
  );
}
