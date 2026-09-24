import {
  createDoctorPatientAssignmentSchema,
  createPatientSchema,
  upsertPatientDeliveryConsentSchema,
} from '@hms/shared-types';

import { DEMO_PATIENT_FIXTURES } from './demo-patient-fixtures';
import {
  DemoPatientFixture,
  DemoPatientStepInput,
  DemoRegionCodes,
  DemoSeedLine,
} from './seed-demo.types';

/** Village codes are `PP.RR.DD.VVVV`; the chain above a village is its prefixes. */
const REGION_CODE_SEPARATOR = '.';

/**
 * Registers the demo patients the way the front desk does, as the demo ADMIN:
 *
 * - through `PatientManagementService.createPatient`, so the MRN is allocated
 *   by the clinic's own counter, the NIK is encrypted and indexed, and the
 *   privacy notice is recorded as acknowledged at the front desk;
 * - assigned to the demo doctor (and the pregnant patient to the bidan as
 *   well), because only an assigned clinician may prescribe and order;
 * - with email delivery consent, so the invoice can be sent from the demo.
 *
 * A patient is found again by her NIK's blind index; assignment and consent
 * are checked separately, so a patient whose consent was withdrawn during a
 * rehearsal gets it back on the next run.
 */
export async function seedDemoPatients(input: DemoPatientStepInput): Promise<DemoSeedLine[]> {
  const lines: DemoSeedLine[] = [];
  for (const fixture of DEMO_PATIENT_FIXTURES) {
    lines.push(await ensureDemoPatient({ ...input, fixture }));
  }
  return lines;
}

async function ensureDemoPatient(
  input: DemoPatientStepInput & { fixture: DemoPatientFixture },
): Promise<DemoSeedLine> {
  const { fixture } = input;
  const label = `${fixture.fullName} (${fixture.scenario})`;
  const found = await findPatientId(input);
  const patientId = found ?? (await createPatient(input));
  const hasNewAssignment = await ensureAssignments({ ...input, patientId });
  const hasNewConsent = await ensureEmailConsent({ ...input, patientId });
  if (found === null) {
    return { section: 'Patients', label, outcome: 'CREATED' };
  }
  return {
    section: 'Patients',
    label,
    outcome: hasNewAssignment || hasNewConsent ? 'UPDATED' : 'EXISTING',
  };
}

async function findPatientId(
  input: DemoPatientStepInput & { fixture: DemoPatientFixture },
): Promise<string | null> {
  const patient = await input.services.prisma.patientProfile.findFirst({
    where: {
      nikIndex: input.services.crypto.computeBlindIndex(input.fixture.nik),
      deletedAt: null,
    },
    select: { id: true },
  });
  return patient?.id ?? null;
}

async function createPatient(
  input: DemoPatientStepInput & { fixture: DemoPatientFixture },
): Promise<string> {
  const { services, fixture } = input;
  const notice = await services.privacyNotice.findCurrentVersion();
  if (notice === null) {
    throw new Error('No current privacy notice to record the demo patients against');
  }
  const created = await services.patientManagement.createPatient(
    createPatientSchema.parse({
      fullName: fixture.fullName,
      dateOfBirth: fixture.dateOfBirth,
      sex: fixture.sex,
      phoneNumber: fixture.phoneNumber,
      address: fixture.address,
      ...toRegionCodes(fixture.villageCode),
      nik: fixture.nik,
      email: fixture.email,
      maritalStatus: fixture.maritalStatus,
      occupation: fixture.occupation,
      privacyNotice: {
        privacyNoticeVersionId: notice.id,
        locale: 'id',
        outcome: 'ACKNOWLEDGED',
        subjectType: 'SELF',
        provenance: 'FRONT_DESK',
      },
    }),
    input.admin,
  );
  return created.patient.id;
}

function toRegionCodes(villageCode: string): DemoRegionCodes {
  const segments = villageCode.split(REGION_CODE_SEPARATOR);
  return {
    provinceCode: segments.slice(0, 1).join(REGION_CODE_SEPARATOR),
    regencyCode: segments.slice(0, 2).join(REGION_CODE_SEPARATOR),
    districtCode: segments.slice(0, 3).join(REGION_CODE_SEPARATOR),
    villageCode,
  };
}

/** True when any assignment had to be created. */
async function ensureAssignments(
  input: DemoPatientStepInput & { fixture: DemoPatientFixture; patientId: string },
): Promise<boolean> {
  let hasCreated = false;
  for (const profession of input.fixture.clinicianProfessions) {
    const doctorId = input.doctorIdsByProfession.get(profession);
    if (doctorId === undefined) {
      throw new Error(`No demo ${profession} profile to assign ${input.fixture.fullName} to`);
    }
    const result = await input.services.doctorPatient.assignDoctorToPatient(
      createDoctorPatientAssignmentSchema.parse({ doctorId, patientId: input.patientId }),
      input.admin,
    );
    hasCreated = hasCreated || result.created;
  }
  return hasCreated;
}

/** True when consent had to be granted. */
async function ensureEmailConsent(
  input: DemoPatientStepInput & { patientId: string },
): Promise<boolean> {
  const view = await input.services.deliveryConsent.listConsents(input.patientId, input.admin);
  const email = view.channels.find((channel) => channel.channel === 'EMAIL');
  if (email?.consent?.isGranted === true) {
    return false;
  }
  await input.services.deliveryConsent.upsertConsent(
    input.patientId,
    upsertPatientDeliveryConsentSchema.parse({ channel: 'EMAIL', isGranted: true }),
    input.admin,
  );
  return true;
}
