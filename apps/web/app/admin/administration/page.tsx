import { AdminUsersPanel } from '#components/client/administration/admin-users-panel';
import { parseAdminUsersSearchParams } from '#lib/admin-users/search-params';

type AdminAdministrationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAdministrationPage({
  searchParams,
}: AdminAdministrationPageProps) {
  const query = parseAdminUsersSearchParams(await searchParams);

  return <AdminUsersPanel initialQuery={query} />;
}
