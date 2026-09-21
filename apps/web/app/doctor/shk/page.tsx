import { ShkWorklistPage } from '#components/server/maternal-care/shk-worklist-page';

type DoctorShkPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "Skrining SHK" in the clinician shell (P25-T10). */
export default async function DoctorShkPage({ searchParams }: DoctorShkPageProps) {
  return <ShkWorklistPage shell="doctor" searchParams={await searchParams} />;
}
