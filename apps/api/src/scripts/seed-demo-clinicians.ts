import {
  ClinicianProfessionValue,
  createDoctorAuthoritySchema,
  createDoctorRequestSchema,
  updateDoctorScheduleSchema,
} from '@hms/shared-types';

import { buildDemoScheduleEntries } from './build-demo-schedule-entries';
import { DEMO_CLINICIAN_FIXTURES } from './demo-clinician-fixtures';
import { isDemoScheduleInPlace } from './is-demo-schedule-in-place';
import {
  DemoClinicianFixture,
  DemoCliniciansResult,
  DemoSeedLine,
  DemoStepInput,
} from './seed-demo.types';

/**
 * The midwife's IUD/implant kewenangan (P25-T02), so the KB demo can show an
 * IUD insertion without the 422 an unauthorised midwife gets. Invented
 * references, marked `DEMO`, valid for five years from the grant.
 */
const DEMO_MIDWIFE_AUTHORITY = {
  kind: 'IUD_IMPLANT',
  grantKind: 'DINAS_PENETAPAN',
  grantReference: 'DEMO/PENETAPAN-DINKES/2025/001',
  grantIssuedAt: '2025-01-10',
  trainingCertificateNumber: 'DEMO/PELATIHAN-AKDR-IMPLAN/2024/017',
  validFrom: '2025-01-10',
  validUntil: '2030-01-09',
} as const;

/**
 * Creates the doctor and midwife profiles behind the clinician logins, opens
 * their every-day 07:00–22:00 schedule, and gives the midwife her IUD/implant
 * authority.
 *
 * The profile is created through `DoctorManagementService.createDoctor` with
 * the login's email, which attaches the existing account (P19-T15) exactly as
 * the create-doctor form does, and every required field is filled so neither
 * login lands on the complete-profile page. Found again by licence number.
 */
export async function seedDemoClinicians(input: DemoStepInput): Promise<DemoCliniciansResult> {
  const lines: DemoSeedLine[] = [];
  const doctorIdsByProfession = new Map<ClinicianProfessionValue, string>();
  for (const fixture of DEMO_CLINICIAN_FIXTURES) {
    const profile = await ensureClinicianProfile({ ...input, fixture });
    lines.push(profile.line);
    lines.push(await ensureSchedule({ ...input, fixture, doctorId: profile.doctorId }));
    if (fixture.profession === 'MIDWIFE') {
      lines.push(await ensureMidwifeAuthority({ ...input, doctorId: profile.doctorId }));
    }
    doctorIdsByProfession.set(fixture.profession, profile.doctorId);
  }
  return { lines, doctorIdsByProfession };
}

async function ensureClinicianProfile(
  input: DemoStepInput & { fixture: DemoClinicianFixture },
): Promise<{ doctorId: string; line: DemoSeedLine }> {
  const { services, fixture } = input;
  const label = `${fixture.profession} profile ${fixture.licenseNumber}`;
  const existing = await services.prisma.doctorProfile.findUnique({
    where: { licenseNumber: fixture.licenseNumber },
    select: { id: true },
  });
  if (existing !== null) {
    return { doctorId: existing.id, line: { section: 'Clinicians', label, outcome: 'EXISTING' } };
  }
  const created = await services.doctorManagement.createDoctor(
    createDoctorRequestSchema.parse({
      licenseNumber: fixture.licenseNumber,
      fullName: fixture.fullName,
      specialtyId: await findSpecialtyId(input, fixture.specialtyName),
      profession: fixture.profession,
      phoneNumber: fixture.phoneNumber,
      email: fixture.accountEmail,
      title: fixture.titleCode,
      nik: fixture.nik,
      licenses: fixture.licenses,
    }),
    input.superAdmin,
  );
  return { doctorId: created.id, line: { section: 'Clinicians', label, outcome: 'CREATED' } };
}

async function findSpecialtyId(input: DemoStepInput, specialtyName: string): Promise<string> {
  const specialty = await input.services.prisma.specialty.findFirst({
    where: { name: specialtyName, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (specialty === null) {
    throw new Error(`Specialty "${specialtyName}" is missing or inactive; run \`pnpm db:seed\``);
  }
  return specialty.id;
}

async function ensureSchedule(
  input: DemoStepInput & { fixture: DemoClinicianFixture; doctorId: string },
): Promise<DemoSeedLine> {
  const label = `${input.fixture.profession} weekly schedule 07:00-22:00`;
  const expected = buildDemoScheduleEntries();
  const stored = await input.services.prisma.doctorSchedule.findMany({
    where: { doctorId: input.doctorId },
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      isAvailable: true,
      maxPatients: true,
    },
  });
  if (isDemoScheduleInPlace({ stored, expected })) {
    return { section: 'Clinicians', label, outcome: 'EXISTING' };
  }
  await input.services.doctorManagement.updateDoctorSchedule(
    input.doctorId,
    updateDoctorScheduleSchema.parse({ schedules: expected }),
    input.superAdmin,
  );
  return { section: 'Clinicians', label, outcome: stored.length === 0 ? 'CREATED' : 'UPDATED' };
}

async function ensureMidwifeAuthority(
  input: DemoStepInput & { doctorId: string },
): Promise<DemoSeedLine> {
  const label = 'MIDWIFE authority IUD_IMPLANT';
  const authorities = await input.services.doctorAuthority.listAuthorities(input.doctorId);
  const hasLiveAuthority = authorities.some(
    (authority) => authority.kind === DEMO_MIDWIFE_AUTHORITY.kind && authority.revokedAt === null,
  );
  if (hasLiveAuthority) {
    return { section: 'Clinicians', label, outcome: 'EXISTING' };
  }
  await input.services.doctorAuthority.createAuthority(
    input.doctorId,
    createDoctorAuthoritySchema.parse(DEMO_MIDWIFE_AUTHORITY),
    input.superAdmin,
  );
  return { section: 'Clinicians', label, outcome: 'CREATED' };
}
