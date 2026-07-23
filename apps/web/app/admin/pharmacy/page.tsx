import { PharmacyPanel } from '#components/client/pharmacy/pharmacy-panel';
import { parsePharmacySearchParams } from '#lib/pharmacy/search-params';

type AdminPharmacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPharmacyPage({ searchParams }: AdminPharmacyPageProps) {
  const query = parsePharmacySearchParams(await searchParams);
  return <PharmacyPanel initialQuery={query} />;
}
