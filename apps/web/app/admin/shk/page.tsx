import { ShkWorklistPage } from '#components/server/maternal-care/shk-worklist-page';

type AdminShkPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "Skrining SHK" in the admin shell, mirroring the clinician page (P25-T10). */
export default async function AdminShkPage({ searchParams }: AdminShkPageProps) {
  return <ShkWorklistPage shell="admin" searchParams={await searchParams} />;
}
