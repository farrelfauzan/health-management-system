import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { CurrentUser } from '../common/auth/current-user.type';
import { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';
import { PasswordHasherService } from '../common/crypto/password-hasher.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PrivacyNoticeRepository } from '../common/privacy-notice/privacy-notice.repository';
import { AdminManagementService } from '../modules/admin-management/service/admin-management.service';
import { ClinicProfileService } from '../modules/billing/service/clinic-profile.service';
import { ServiceTariffService } from '../modules/billing/service/service-tariff.service';
import { PatientDeliveryConsentService } from '../modules/document-delivery/service/patient-delivery-consent.service';
import { DoctorAuthorityService } from '../modules/doctor-management/service/doctor-authority.service';
import { DoctorManagementService } from '../modules/doctor-management/service/doctor-management.service';
import { DoctorPatientService } from '../modules/doctor-patient/service/doctor-patient.service';
import { FeatureEntitlementService } from '../modules/feature-entitlement/service/feature-entitlement.service';
import { LabCatalogService } from '../modules/laboratory/service/lab-catalog.service';
import { PatientManagementService } from '../modules/patient-management/service/patient-management.service';
import { PharmacyFlowService } from '../modules/pharmacy-flow/service/pharmacy-flow.service';
import { assertDemoSeedTarget } from './assert-demo-seed-target';
import { DEMO_ACCOUNT_FIXTURES } from './demo-account-fixtures';
import { formatDemoSeedSummary } from './format-demo-seed-summary';
import { parseDemoSeedPassword } from './parse-demo-seed-password';
import { seedDemoAccounts } from './seed-demo-accounts';
import { seedDemoClinic } from './seed-demo-clinic';
import { seedDemoClinicians } from './seed-demo-clinicians';
import { seedDemoPatients } from './seed-demo-patients';
import { seedDemoPharmacy } from './seed-demo-pharmacy';
import { seedDemoTariffs } from './seed-demo-tariffs';
import { DemoAccountStepInput, DemoRoleCode, DemoSeedServices } from './seed-demo.types';

const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

/**
 * One command from a base-seeded database to one the core clinic demo can be
 * run on, end to end: registration, check-in, the doctor's examination with
 * lab and prescription, the lab bench, the pharmacy, and the cashier.
 *
 * Creates, or finds from a previous run:
 * - five staff logins on `@demo.salingjaga.com` (ADMIN, DOCTOR, MIDWIFE,
 *   LAB_TECHNICIAN, PHARMACIST) sharing `DEMO_SEED_PASSWORD`, and replaces
 *   the public default password on the bootstrap logins while it is unused;
 * - complete doctor and midwife profiles with an every-day 07:00–22:00
 *   schedule, and the midwife's IUD/implant authority;
 * - a clinic profile (when none exists) and the maternal-care feature;
 * - tariffs for the midwife consultation, ANC, KB, persalinan, administrasi
 *   and every active lab test and panel;
 * - two midwife-prescribable medications and stock for every medication;
 * - six invented patients with privacy-notice evidence, clinician
 *   assignments and email delivery consent.
 *
 * No encounter, invoice or appointment is created: the demo creates those
 * live. Everything is written through the services the screens use, acting
 * as the person who would do it at the counter. Idempotent — a second run
 * reports every record as already present. Refuses `NODE_ENV=production` and
 * a database without the base seed; never prints a password or a NIK.
 *
 * Usage (see docs/ops/demo-seed.md):
 *   `DEMO_SEED_PASSWORD='<at least 12 characters>' pnpm db:seed:demo`
 */
async function seedDemo(): Promise<void> {
  assertDemoSeedTarget({ nodeEnv: process.env.NODE_ENV });
  const password = parseDemoSeedPassword(process.env.DEMO_SEED_PASSWORD);
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const services = resolveServices(context);
    assertDemoSeedTarget({
      nodeEnv: process.env.NODE_ENV,
      database: {
        presentRoleCodes: await listRoleCodes(services),
        hasPrivacyNotice: (await services.privacyNotice.findCurrentVersion()) !== null,
      },
    });
    const superAdmin = await requireSuperAdmin(services);
    await runDemoSeed({ services, password, superAdmin });
  } finally {
    await context.close();
  }
}

function resolveServices(context: INestApplicationContext): DemoSeedServices {
  return {
    prisma: context.get(PrismaService),
    crypto: context.get(NationalIdentifierCryptoService),
    passwordHasher: context.get(PasswordHasherService),
    adminManagement: context.get(AdminManagementService),
    doctorManagement: context.get(DoctorManagementService),
    doctorAuthority: context.get(DoctorAuthorityService),
    clinicProfile: context.get(ClinicProfileService),
    featureEntitlement: context.get(FeatureEntitlementService),
    serviceTariff: context.get(ServiceTariffService),
    labCatalog: context.get(LabCatalogService),
    pharmacyFlow: context.get(PharmacyFlowService),
    patientManagement: context.get(PatientManagementService),
    doctorPatient: context.get(DoctorPatientService),
    deliveryConsent: context.get(PatientDeliveryConsentService),
    privacyNotice: context.get(PrivacyNoticeRepository),
  };
}

async function listRoleCodes(services: DemoSeedServices): Promise<string[]> {
  const roles = await services.prisma.role.findMany({
    where: { deletedAt: null },
    select: { code: true },
  });
  return roles.map((role) => role.code);
}

/**
 * The account staff setup is recorded against — the earliest active super
 * admin, which on a base-seeded database is `admin@salingjaga.com`.
 */
async function requireSuperAdmin(services: DemoSeedServices): Promise<CurrentUser> {
  const user = await services.prisma.user.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      isSystem: false,
      roles: {
        some: { deletedAt: null, unassignedAt: null, role: { code: SUPER_ADMIN_ROLE_CODE } },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (user === null) {
    throw new Error(
      'Refusing to seed demo data: no active SUPER_ADMIN account; run `pnpm db:seed` first',
    );
  }
  return { sub: user.id, email: user.email };
}

async function runDemoSeed(input: DemoAccountStepInput): Promise<void> {
  const { services, superAdmin } = input;
  const accounts = await seedDemoAccounts(input);
  const admin = requireActor(accounts.actorsByEmail, 'ADMIN');
  const pharmacist = requireActor(accounts.actorsByEmail, 'PHARMACIST');
  const clinicians = await seedDemoClinicians({ services, superAdmin });
  const clinicLines = await seedDemoClinic({ services, superAdmin });
  const tariffLines = await seedDemoTariffs({ services, superAdmin });
  const pharmacyLines = await seedDemoPharmacy({ services, pharmacist });
  const patientLines = await seedDemoPatients({
    services,
    admin,
    doctorIdsByProfession: clinicians.doctorIdsByProfession,
  });
  const summary = formatDemoSeedSummary({
    lines: [
      ...accounts.lines,
      ...clinicians.lines,
      ...clinicLines,
      ...tariffLines,
      ...pharmacyLines,
      ...patientLines,
    ],
    accounts: DEMO_ACCOUNT_FIXTURES,
    resetBootstrapEmails: accounts.resetBootstrapEmails,
  });
  summary.forEach((line) => console.log(line));
}

function requireActor(
  actorsByEmail: ReadonlyMap<string, CurrentUser>,
  roleCode: DemoRoleCode,
): CurrentUser {
  const fixture = DEMO_ACCOUNT_FIXTURES.find((account) => account.roleCode === roleCode);
  const actor = fixture === undefined ? undefined : actorsByEmail.get(fixture.email);
  if (actor === undefined) {
    throw new Error(`The demo ${roleCode} login was not seeded`);
  }
  return actor;
}

seedDemo().catch((caughtError: unknown) => {
  console.error(
    caughtError instanceof Error ? `Demo seed failed: ${caughtError.message}` : 'Demo seed failed',
  );
  process.exit(1);
});
