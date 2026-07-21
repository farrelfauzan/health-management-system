import { DoctorsDirectoryPanel } from '#components/client/doctors/doctors-directory-panel';
import { parseDoctorsSearchParams } from '#lib/doctors/search-params';

type AdminDoctorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDoctorsPage({ searchParams }: AdminDoctorsPageProps) {
  const query = parseDoctorsSearchParams(await searchParams);

  return <DoctorsDirectoryPanel initialQuery={query} />;
}
