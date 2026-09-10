import { AdministrationTabs } from '#components/client/administration/administration-tabs';
import { ADMINISTRATION_TABS } from '#lib/admin-users/administration-tabs';
import { parseAdminUsersSearchParams } from '#lib/admin-users/search-params';
import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';

type AdminAdministrationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAdministrationPage({
  searchParams,
}: AdminAdministrationPageProps) {
  const params = await searchParams;
  const query = parseAdminUsersSearchParams(params);

  return (
    <AdministrationTabs
      initialQuery={query}
      initialTab={parseTabSearchParam(params.tab, ADMINISTRATION_TABS)}
    />
  );
}
