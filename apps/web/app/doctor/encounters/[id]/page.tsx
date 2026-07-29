import { EncounterWorkspace } from '#components/client/encounters/encounter-workspace';

type DoctorEncounterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DoctorEncounterDetailPage({
  params,
}: DoctorEncounterDetailPageProps) {
  const { id } = await params;

  // No patient-link prefix: a doctor session has no patient directory route.
  return <EncounterWorkspace encounterId={id} breadcrumbRoot="Doctor" patientHrefPrefix="" />;
}
