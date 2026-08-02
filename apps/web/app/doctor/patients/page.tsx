import { PatientsDirectoryPanel } from '#components/client/patients/patients-directory-panel';
import { parsePatientsSearchParams } from '#lib/patients/search-params';

type DoctorPatientsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientsPage({ searchParams }: DoctorPatientsPageProps) {
  const query = parsePatientsSearchParams(await searchParams);

  // Scoped to the doctor's assigned patients by `patient.read:own`.
  return <PatientsDirectoryPanel initialQuery={query} patientDetailBasePath="/doctor/patients" />;
}
