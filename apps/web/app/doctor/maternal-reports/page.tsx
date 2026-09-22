import { MaternalReportsPage } from '#components/server/maternal-care/maternal-reports-page';

type DoctorMaternalReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "Laporan KIA" in the clinician shell (P25-T15). */
export default async function DoctorMaternalReportsPage({
  searchParams,
}: DoctorMaternalReportsPageProps) {
  return <MaternalReportsPage shell="doctor" searchParams={await searchParams} />;
}
