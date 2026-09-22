import { MaternalReportsPage } from '#components/server/maternal-care/maternal-reports-page';

type AdminMaternalReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "Laporan KIA" in the admin shell, mirroring the clinician page (P25-T15). */
export default async function AdminMaternalReportsPage({
  searchParams,
}: AdminMaternalReportsPageProps) {
  return <MaternalReportsPage shell="admin" searchParams={await searchParams} />;
}
