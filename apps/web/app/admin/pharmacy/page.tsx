import { getTranslations } from 'next-intl/server';

import { PharmacyWorkspace } from '#components/client/pharmacy/pharmacy-workspace';
import { PageHeader } from '#components/shared/page-header';
import { parsePharmacySearchParams } from '#lib/pharmacy/search-params';

type AdminPharmacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPharmacyPage({ searchParams }: AdminPharmacyPageProps) {
  const t = await getTranslations('pharmacyInventory');
  const query = parsePharmacySearchParams(await searchParams);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('workspaceTitle')}
        subtitle={t('workspaceSubtitle')}
        breadcrumbs={[t('workspaceTitle')]}
      />
      <PharmacyWorkspace initialQuery={query} />
    </div>
  );
}
