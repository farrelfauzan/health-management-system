import { PatientsDirectoryPanel } from '#components/client/patients/patients-directory-panel';
import { PatientsPageHeader } from '#components/client/patients/patients-page-header';
import { parsePatientsSearchParams } from '#lib/patients/search-params';

type DoctorPatientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientsPage({ searchParams }: DoctorPatientsPageProps) {
  const query = parsePatientsSearchParams(await searchParams);

  // Scoped to the doctor's assigned patients by `patient.read:own`. No tab
  // strip here: the chat bookings are a front-desk view (`P19-T08`).
  return (
    <div className="space-y-6">
      <PatientsPageHeader />
      <PatientsDirectoryPanel initialQuery={query} patientDetailBasePath="/doctor/patients" />
    </div>
  );
}
