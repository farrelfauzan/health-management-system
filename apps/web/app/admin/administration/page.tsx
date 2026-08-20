import { AdministrationTabs } from '#components/client/administration/administration-tabs';
import { parseAdminUsersSearchParams } from '#lib/admin-users/search-params';

type AdminAdministrationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAdministrationPage({
  searchParams,
}: AdminAdministrationPageProps) {
  const params = await searchParams;
  const query = parseAdminUsersSearchParams(params);
  const defaultTab = params.tab === 'roles' ? ('roles' as const) : ('users' as const);

  return <AdministrationTabs initialQuery={query} defaultTab={defaultTab} />;
}
