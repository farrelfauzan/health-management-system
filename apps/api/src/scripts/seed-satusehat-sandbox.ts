import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from '../app.module';
import { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SatusehatAmbiguousMatchError } from '../common/satusehat/satusehat-ambiguous-match.error';
import { SatusehatMasterDataClient } from '../common/satusehat/satusehat-master-data.client';
import { resolveSatusehatConfig } from '../common/satusehat/satusehat.config';
import { SATUSEHAT_SANDBOX_PATIENTS } from '../modules/satusehat/fixtures/satusehat-sandbox-patients';
import { SATUSEHAT_SANDBOX_PRACTITIONERS } from '../modules/satusehat/fixtures/satusehat-sandbox-practitioners';
import { SatusehatLinkRepository } from '../modules/satusehat/repository/satusehat-link.repository';
import { assertSatusehatSandboxSeedTarget } from './assert-satusehat-sandbox-seed-target';
import {
  SandboxSeedLine,
  SandboxSeedLinkOutcome,
  SandboxSeedRecordOutcome,
} from './seed-satusehat-sandbox.types';

const EXTRA_DOCTOR_COUNT_FLAG = '--extra-doctors=';
const DEFAULT_EXTRA_DOCTOR_COUNT = 2;
const PRIMARY_DOCTOR_LICENSE = 'SANDBOX-DOCTOR-PRIMARY';
const EXTRA_DOCTOR_LICENSE_PREFIX = 'SANDBOX-DOCTOR-';
const PATIENT_MRN_PREFIX = 'SANDBOX-PATIENT-';
const PLACEHOLDER_PHONE = '080000000000';
const PLACEHOLDER_ADDRESS = 'Alamat uji sandbox SATUSEHAT';
const PLACEHOLDER_BIRTH_DATE = new Date('1990-01-01');

type SeedDependencies = {
  prisma: PrismaService;
  crypto: NationalIdentifierCryptoService;
  masterData: SatusehatMasterDataClient;
  links: SatusehatLinkRepository;
};

type LinkResolution = {
  outcome: SandboxSeedLinkOutcome;
  ihsNumber: string | null;
};

/**
 * One command from a fresh local database to linked SATUSEHAT test doctors and
 * patients, ready to close an encounter and submit it (P21-T10).
 *
 * Creates, or finds from a previous run:
 * - a primary doctor on `3313096403900009`, the one published practitioner NIK
 *   that resolves to exactly one record, linked by NIK;
 * - `--extra-doctors=N` (default 2) further doctors **sharing that practitioner
 *   id**. `nik_index` is unique, so only one local doctor can hold the NIK; the
 *   extras carry the IHS number directly and no NIK. That is a sandbox-only
 *   shortcut — in production each doctor is a different person with their own
 *   national record;
 * - one patient per {@link SATUSEHAT_SANDBOX_PATIENTS} entry, linked by NIK.
 *
 * Records are written directly, not through the create routes, so no
 * invitation is sent and no account is created: the doctors show as
 * `NO_ACCOUNT` in the directory (P20-T01), which does not affect SATUSEHAT
 * submission. Seeded patients carry no privacy-notice evidence for the same
 * reason.
 *
 * Idempotent — records are found by NIK blind index or by their fixed licence /
 * MRN, and an already-linked record is not looked up again — so it is safe to
 * repeat. Refuses to run outside a configured, non-production, sandbox-pointed
 * deployment. Never logs a NIK. Exits non-zero when any identity fails to link,
 * which means the shared sandbox has drifted since the fixtures were probed.
 *
 * Usage:
 *   `pnpm --filter @hms/api seed:satusehat-sandbox [-- --extra-doctors=<n>]`
 */
async function seedSatusehatSandbox(): Promise<void> {
  const satusehatConfig = resolveSatusehatConfig(new ConfigService());
  assertSatusehatSandboxSeedTarget({
    fhirBaseUrl: satusehatConfig.fhirBaseUrl,
    nodeEnv: process.env.NODE_ENV,
    isConfigured: satusehatConfig.isConfigured,
  });
  const extraDoctorCount = parseExtraDoctorCount(process.argv.slice(2));
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const dependencies: SeedDependencies = {
      prisma: context.get(PrismaService),
      crypto: context.get(NationalIdentifierCryptoService),
      masterData: context.get(SatusehatMasterDataClient),
      links: context.get(SatusehatLinkRepository),
    };
    const specialtyId = await findSeedSpecialtyId(dependencies.prisma);
    const doctorLines = await seedDoctors(dependencies, specialtyId, extraDoctorCount);
    const patientLines = await seedPatients(dependencies);
    printSummary([...doctorLines, ...patientLines]);
  } finally {
    await context.close();
  }
}

function parseExtraDoctorCount(argv: readonly string[]): number {
  const argument = argv.find((candidate) => candidate.startsWith(EXTRA_DOCTOR_COUNT_FLAG));
  if (argument === undefined) {
    return DEFAULT_EXTRA_DOCTOR_COUNT;
  }
  const parsed = Number(argument.slice(EXTRA_DOCTOR_COUNT_FLAG.length));
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${EXTRA_DOCTOR_COUNT_FLAG} must be a non-negative integer`);
  }
  return parsed;
}

/** Any active specialty will do: submission does not report the specialty. */
async function findSeedSpecialtyId(prisma: PrismaService): Promise<string> {
  const specialty = await prisma.specialty.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  if (specialty === null) {
    throw new Error('No active specialty exists: run `pnpm db:seed` first');
  }
  return specialty.id;
}

/**
 * Resolves an IHS number by live lookup, turning an ambiguous index answer into
 * an outcome rather than an exception, so one drifted identity does not stop
 * the rest of the seed.
 */
async function resolveLink(lookup: () => Promise<string | null>): Promise<LinkResolution> {
  try {
    const ihsNumber = await lookup();
    return ihsNumber === null
      ? { outcome: 'NOT_FOUND', ihsNumber: null }
      : { outcome: 'LINKED', ihsNumber };
  } catch (caughtError) {
    if (caughtError instanceof SatusehatAmbiguousMatchError) {
      return { outcome: 'AMBIGUOUS', ihsNumber: null };
    }
    throw caughtError;
  }
}

async function seedDoctors(
  dependencies: SeedDependencies,
  specialtyId: string,
  extraDoctorCount: number,
): Promise<SandboxSeedLine[]> {
  const primary = await seedPrimaryDoctor(dependencies, specialtyId);
  const lines: SandboxSeedLine[] = [primary.line];
  for (let position = 1; position <= extraDoctorCount; position += 1) {
    lines.push(
      await seedExtraDoctor({
        prisma: dependencies.prisma,
        specialtyId,
        position,
        practitionerIhsNumber: primary.practitionerIhsNumber,
      }),
    );
  }
  return lines;
}

/**
 * Found by NIK blind index rather than licence, so a doctor who already holds
 * the NIK — for instance from the older `seed:sandbox-practitioner-nik` — is
 * reused instead of colliding with the unique index.
 */
async function seedPrimaryDoctor(
  dependencies: SeedDependencies,
  specialtyId: string,
): Promise<{ line: SandboxSeedLine; practitionerIhsNumber: string | null }> {
  const identity = SATUSEHAT_SANDBOX_PRACTITIONERS[0];
  if (identity === undefined) {
    throw new Error('The sandbox practitioner fixture is empty');
  }
  const { prisma, crypto } = dependencies;
  const existing = await prisma.doctorProfile.findFirst({
    where: { nikIndex: crypto.computeBlindIndex(identity.nik) },
    select: { id: true, satusehatPractitionerId: true },
  });
  const record: SandboxSeedRecordOutcome = existing === null ? 'CREATED' : 'EXISTING';
  const doctor =
    existing ??
    (await prisma.doctorProfile.create({
      data: {
        licenseNumber: PRIMARY_DOCTOR_LICENSE,
        fullName: identity.name,
        specialtyId,
        phoneNumber: PLACEHOLDER_PHONE,
        ...toNikColumns(crypto, identity.nik),
      },
      select: { id: true, satusehatPractitionerId: true },
    }));
  if (doctor.satusehatPractitionerId !== null) {
    return {
      line: { label: 'Primary doctor', record, link: 'ALREADY_LINKED' },
      practitionerIhsNumber: doctor.satusehatPractitionerId,
    };
  }
  const resolution = await resolveLink(() =>
    dependencies.masterData.findPractitionerIhsNumberByNik(identity.nik),
  );
  if (resolution.ihsNumber !== null) {
    await dependencies.links.saveDoctorIhsNumber({
      doctorId: doctor.id,
      ihsNumber: resolution.ihsNumber,
    });
  }
  return {
    line: { label: 'Primary doctor', record, link: resolution.outcome },
    practitionerIhsNumber: resolution.ihsNumber,
  };
}

/**
 * Carries the primary doctor's IHS number and no NIK — the sandbox-only
 * shortcut. When the primary could not be linked there is nothing to share, so
 * the extra is still created but reported unlinked.
 */
async function seedExtraDoctor(input: {
  prisma: PrismaService;
  specialtyId: string;
  position: number;
  practitionerIhsNumber: string | null;
}): Promise<SandboxSeedLine> {
  const label = `Extra doctor ${input.position}`;
  const licenseNumber = `${EXTRA_DOCTOR_LICENSE_PREFIX}${input.position}`;
  const existing = await input.prisma.doctorProfile.findUnique({
    where: { licenseNumber },
    select: { id: true, satusehatPractitionerId: true },
  });
  if (existing !== null && existing.satusehatPractitionerId !== null) {
    return { label, record: 'EXISTING', link: 'ALREADY_LINKED' };
  }
  const link: SandboxSeedLinkOutcome =
    input.practitionerIhsNumber === null ? 'NOT_FOUND' : 'LINKED';
  if (existing !== null) {
    await input.prisma.doctorProfile.update({
      where: { id: existing.id },
      data: { satusehatPractitionerId: input.practitionerIhsNumber },
    });
    return { label, record: 'EXISTING', link };
  }
  await input.prisma.doctorProfile.create({
    data: {
      licenseNumber,
      fullName: `dr. Dokter Uji Sandbox ${input.position}`,
      specialtyId: input.specialtyId,
      phoneNumber: PLACEHOLDER_PHONE,
      satusehatPractitionerId: input.practitionerIhsNumber,
    },
  });
  return { label, record: 'CREATED', link };
}

async function seedPatients(dependencies: SeedDependencies): Promise<SandboxSeedLine[]> {
  const lines: SandboxSeedLine[] = [];
  for (const [index, identity] of SATUSEHAT_SANDBOX_PATIENTS.entries()) {
    lines.push(
      await seedPatient(dependencies, {
        position: index + 1,
        nik: identity.nik,
        name: identity.name,
        sex: identity.sex,
      }),
    );
  }
  return lines;
}

async function seedPatient(
  dependencies: SeedDependencies,
  identity: { position: number; nik: string; name: string; sex: 'MALE' | 'FEMALE' },
): Promise<SandboxSeedLine> {
  const { prisma, crypto } = dependencies;
  const label = `Patient ${identity.position}`;
  const existing = await prisma.patientProfile.findFirst({
    where: { nikIndex: crypto.computeBlindIndex(identity.nik) },
    select: { id: true, satusehatPatientIdCiphertext: true },
  });
  const record: SandboxSeedRecordOutcome = existing === null ? 'CREATED' : 'EXISTING';
  const patient =
    existing ??
    (await prisma.patientProfile.create({
      data: {
        mrn: `${PATIENT_MRN_PREFIX}${identity.position}`,
        fullName: identity.name,
        dateOfBirth: PLACEHOLDER_BIRTH_DATE,
        sex: identity.sex,
        phoneNumber: PLACEHOLDER_PHONE,
        address: PLACEHOLDER_ADDRESS,
        ...toNikColumns(crypto, identity.nik),
      },
      select: { id: true, satusehatPatientIdCiphertext: true },
    }));
  if (patient.satusehatPatientIdCiphertext !== null) {
    return { label, record, link: 'ALREADY_LINKED' };
  }
  const resolution = await resolveLink(() =>
    dependencies.masterData.findPatientIhsNumberByNik(identity.nik),
  );
  if (resolution.ihsNumber !== null) {
    await dependencies.links.savePatientIhsNumber({
      patientId: patient.id,
      ihsNumber: resolution.ihsNumber,
    });
  }
  return { label, record, link: resolution.outcome };
}

/** The NIK written the way every other identifier is: encrypted and indexed. */
function toNikColumns(
  crypto: NationalIdentifierCryptoService,
  nik: string,
): { nikCiphertext: string; nikIndex: string; nikLast4: string; nikKeyVersion: number } {
  const encrypted = crypto.encryptSearchableIdentifier(nik);
  return {
    nikCiphertext: encrypted.ciphertext,
    nikIndex: encrypted.index,
    nikLast4: encrypted.last4,
    nikKeyVersion: encrypted.keyVersion,
  };
}

function printSummary(lines: readonly SandboxSeedLine[]): void {
  lines.forEach((line) => {
    console.log(`  ${line.label}: ${line.record.toLowerCase()}, ${line.link.toLowerCase()}`);
  });
  const failures = lines.filter((line) => line.link === 'NOT_FOUND' || line.link === 'AMBIGUOUS');
  if (failures.length === 0) {
    console.log('SATUSEHAT sandbox seed complete: every identity is linked.');
    return;
  }
  console.error(
    `${failures.length} identity(ies) could not be linked. The shared sandbox has drifted since the fixtures were probed — re-probe them (docs/ops/testing-satusehat-locally.md).`,
  );
  process.exitCode = 1;
}

seedSatusehatSandbox().catch((caughtError: unknown) => {
  console.error(
    caughtError instanceof Error
      ? `SATUSEHAT sandbox seed failed: ${caughtError.message}`
      : 'SATUSEHAT sandbox seed failed',
  );
  process.exit(1);
});
