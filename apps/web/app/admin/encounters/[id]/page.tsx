import { EncounterAdministrativeView } from '#components/client/encounters/encounter-administrative-view';

type AdminEncounterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminEncounterDetailPage({ params }: AdminEncounterDetailPageProps) {
  const { id } = await params;

  // P22-T02, enforcing D-033: the administrator sees who, when and what state
  // the visit is in — never the doctor's workspace, which is the clinical
  // record itself. That is also why the feature flags this page used to read
  // are gone: the laboratory and maternal cards are clinical content, and this
  // screen has no path to them to gate.
  return <EncounterAdministrativeView encounterId={id} />;
}
