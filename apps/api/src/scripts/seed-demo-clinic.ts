import { updateClinicProfileSchema, updateFeatureEntitlementSchema } from '@hms/shared-types';

import { DemoSeedLine, DemoStepInput } from './seed-demo.types';

/** The letterhead on the demo invoice and lab report. Obviously a demo clinic. */
const DEMO_CLINIC_PROFILE = {
  name: 'Klinik Pratama Sehat Bersama (Demo)',
  address: 'Jl. Tebet Raya No. 88, Tebet, Jakarta Selatan 12810',
  phoneNumber: '081200000100',
  email: 'klinik@demo.salingjaga.com',
  licenseNumber: 'DEMO-IZIN-KLINIK-001',
} as const;

/** ANC, KB and persalinan screens live behind this switch, which the base seed leaves off. */
const MATERNAL_CARE_FEATURE_KEY = 'maternal-care';

/**
 * The clinic-wide setup: a clinic profile for the invoice letterhead, and the
 * maternal-care feature switched on for the bidan flow.
 *
 * An existing clinic profile is never overwritten — it may be a real clinic's
 * letterhead that somebody is rehearsing on — and neither step touches the
 * laboratory settings, whose defaults (a technician enters, a clinician
 * releases) are what the demo shows.
 */
export async function seedDemoClinic(input: DemoStepInput): Promise<DemoSeedLine[]> {
  return [await ensureClinicProfile(input), await ensureMaternalCareEnabled(input)];
}

async function ensureClinicProfile(input: DemoStepInput): Promise<DemoSeedLine> {
  const label = 'Clinic profile (invoice letterhead)';
  const existing = await input.services.prisma.clinicProfile.findFirst({ select: { id: true } });
  if (existing !== null) {
    return { section: 'Clinic', label, outcome: 'EXISTING' };
  }
  await input.services.clinicProfile.updateProfile(
    updateClinicProfileSchema.parse(DEMO_CLINIC_PROFILE),
    input.superAdmin,
  );
  return { section: 'Clinic', label, outcome: 'CREATED' };
}

async function ensureMaternalCareEnabled(input: DemoStepInput): Promise<DemoSeedLine> {
  const label = 'Feature maternal-care (ANC / KB / persalinan) enabled';
  const entitlements = await input.services.featureEntitlement.getEntitlements();
  const maternalCare = entitlements.find((entry) => entry.key === MATERNAL_CARE_FEATURE_KEY);
  if (maternalCare?.isEnabled === true) {
    return { section: 'Clinic', label, outcome: 'EXISTING' };
  }
  await input.services.featureEntitlement.updateEntitlement(
    MATERNAL_CARE_FEATURE_KEY,
    updateFeatureEntitlementSchema.parse({
      isEnabled: true,
      notes: 'Enabled by the demo seed for the bidan flow',
    }),
    input.superAdmin.sub,
  );
  return { section: 'Clinic', label, outcome: 'UPDATED' };
}
