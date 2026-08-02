import { PatientDetailPanel } from '#components/client/patients/patient-detail-panel';

type DoctorPatientDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DoctorPatientDetailPage({ params }: DoctorPatientDetailPageProps) {
  const { id } = await params;

  return <PatientDetailPanel patientId={id} />;
}
