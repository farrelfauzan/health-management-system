import { EncounterWorkspace } from '#components/client/encounters/encounter-workspace';

type AdminEncounterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminEncounterDetailPage({ params }: AdminEncounterDetailPageProps) {
  const { id } = await params;

  return <EncounterWorkspace encounterId={id} />;
}
