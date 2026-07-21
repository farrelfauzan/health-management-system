import { DoctorDetailPanel } from '#components/client/doctors/doctor-detail-panel';

type AdminDoctorDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminDoctorDetailPage({ params }: AdminDoctorDetailPageProps) {
  const { id } = await params;

  return <DoctorDetailPanel doctorId={id} />;
}
