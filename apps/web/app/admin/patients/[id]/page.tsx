import { PatientDetailPanel } from '#components/client/patients/patient-detail-panel';

type AdminPatientDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminPatientDetailPage({ params }: AdminPatientDetailPageProps) {
  const { id } = await params;

  return <PatientDetailPanel patientId={id} />;
}
