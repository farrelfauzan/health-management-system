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
  const defaultTab = resolveDefaultTab(params.tab);

  return <AdministrationTabs initialQuery={query} defaultTab={defaultTab} />;
}

function resolveDefaultTab(
  tab: string | string[] | undefined,
): 'users' | 'invitations' | 'roles' | 'clinic' {
  if (tab === 'roles' || tab === 'invitations' || tab === 'clinic') {
    return tab;
  }
  return 'users';
}
