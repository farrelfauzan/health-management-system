import type {
  ClinicianProfessionValue,
  DoctorLicenseTypeValue,
  MaritalStatusValue,
  MedicationUnitValue,
  PatientSexValue,
  ServiceTariffCategoryValue,
} from '@hms/shared-types';

import type { CurrentUser } from '../common/auth/current-user.type';
import type { NationalIdentifierCryptoService } from '../common/crypto/national-identifier-crypto.service';
import type { PasswordHasherService } from '../common/crypto/password-hasher.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { PrivacyNoticeRepository } from '../common/privacy-notice/privacy-notice.repository';
import type { AdminManagementService } from '../modules/admin-management/service/admin-management.service';
import type { ClinicProfileService } from '../modules/billing/service/clinic-profile.service';
import type { ServiceTariffService } from '../modules/billing/service/service-tariff.service';
import type { PatientDeliveryConsentService } from '../modules/document-delivery/service/patient-delivery-consent.service';
import type { DoctorAuthorityService } from '../modules/doctor-management/service/doctor-authority.service';
import type { DoctorManagementService } from '../modules/doctor-management/service/doctor-management.service';
import type { DoctorPatientService } from '../modules/doctor-patient/service/doctor-patient.service';
import type { FeatureEntitlementService } from '../modules/feature-entitlement/service/feature-entitlement.service';
import type { LabCatalogService } from '../modules/laboratory/service/lab-catalog.service';
import type { PatientManagementService } from '../modules/patient-management/service/patient-management.service';
import type { PharmacyFlowService } from '../modules/pharmacy-flow/service/pharmacy-flow.service';

/**
 * What one demo-seed step found: a record it had to create, one already there
 * from an earlier run, or one it brought back to the demo state (a password
 * that no longer matched, a schedule somebody edited, stock that ran low).
 */
export type DemoSeedOutcome = 'CREATED' | 'EXISTING' | 'UPDATED';

/** The summary groups its lines under these headings, in this order. */
export type DemoSeedSection =
  'Accounts' | 'Clinicians' | 'Clinic' | 'Tariffs' | 'Pharmacy' | 'Patients';

/** One summary line. Never carries a password, a NIK or a phone number. */
export type DemoSeedLine = {
  section: DemoSeedSection;
  label: string;
  outcome: DemoSeedOutcome;
};

/** The staff roles the demo signs in as. */
export type DemoRoleCode = 'ADMIN' | 'DOCTOR' | 'MIDWIFE' | 'LAB_TECHNICIAN' | 'PHARMACIST';

/** A demo login. The password is never a fixture: it comes from `DEMO_SEED_PASSWORD`. */
export type DemoAccountFixture = {
  email: string;
  fullName: string;
  roleCode: DemoRoleCode;
  /** What the presenter uses this login for, printed in the summary. */
  purpose: string;
};

export type DemoLicenseFixture = {
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: string;
  expiresAt?: string;
};

/** A practitioner profile owned by one of {@link DemoAccountFixture}'s logins. */
export type DemoClinicianFixture = {
  accountEmail: string;
  profession: ClinicianProfessionValue;
  fullName: string;
  /** A `TITLE` credential option code, e.g. `DR`. */
  titleCode?: string;
  licenseNumber: string;
  /** Matched against `specialties.name`, which is unique. */
  specialtyName: string;
  phoneNumber: string;
  nik: string;
  licenses: readonly DemoLicenseFixture[];
};

/** A fictional patient. Every identifier is invented and marked as such in the docs. */
export type DemoPatientFixture = {
  fullName: string;
  dateOfBirth: string;
  sex: PatientSexValue;
  nik: string;
  phoneNumber: string;
  email: string;
  address: string;
  villageCode: string;
  maritalStatus: MaritalStatusValue;
  occupation: string;
  /** Which demo clinicians the patient is assigned to, so they may prescribe and order. */
  clinicianProfessions: readonly ClinicianProfessionValue[];
  /** Why this patient is in the set, printed in the summary. */
  scenario: string;
};

/** The Kemendagri chain the front-desk create requires, derived from the village code. */
export type DemoRegionCodes = {
  provinceCode: string;
  regencyCode: string;
  districtCode: string;
  villageCode: string;
};

/** A tariff the demo bills: a fixture, or one derived from a lab catalog row. */
export type DemoTariffFixture = {
  code: string;
  name: string;
  category: Exclude<ServiceTariffCategoryValue, 'ACCOMMODATION'>;
  icd9cmCode?: string;
  profession?: ClinicianProfessionValue;
  price: number;
};

/** The tariff a fixture resolved to, and whether the run had to create it. */
export type DemoTariffOutcome = {
  tariffId: string;
  outcome: Extract<DemoSeedOutcome, 'CREATED' | 'EXISTING'>;
};

/** The part of a lab test or panel the tariffs step reads. `price` is absent while it is unpriced. */
export type DemoLabCatalogRow = {
  id: string;
  code: string;
  name: string;
  price?: number;
};

/** A catalog item the midwife may prescribe; the seeded catalog has none. */
export type DemoMedicationFixture = {
  code: string;
  kfaCode: string;
  name: string;
  form: string;
  strength: string;
  unit: MedicationUnitValue;
  unitPrice: number;
};

/** One weekly practice window, in the shape `updateDoctorScheduleSchema` takes. */
export type DemoScheduleEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

/** Every service and repository the steps write through. */
export type DemoSeedServices = {
  prisma: PrismaService;
  crypto: NationalIdentifierCryptoService;
  passwordHasher: PasswordHasherService;
  adminManagement: AdminManagementService;
  doctorManagement: DoctorManagementService;
  doctorAuthority: DoctorAuthorityService;
  clinicProfile: ClinicProfileService;
  featureEntitlement: FeatureEntitlementService;
  serviceTariff: ServiceTariffService;
  labCatalog: LabCatalogService;
  pharmacyFlow: PharmacyFlowService;
  patientManagement: PatientManagementService;
  doctorPatient: DoctorPatientService;
  deliveryConsent: PatientDeliveryConsentService;
  privacyNotice: PrivacyNoticeRepository;
};

/** What every step is handed: the services, and the super admin it sets staff up as. */
export type DemoStepInput = {
  services: DemoSeedServices;
  superAdmin: CurrentUser;
};

/** The accounts step also needs the shared password. */
export type DemoAccountStepInput = DemoStepInput & {
  password: string;
};

/** The patients step acts as the front desk and needs the clinicians to assign. */
export type DemoPatientStepInput = {
  services: DemoSeedServices;
  admin: CurrentUser;
  doctorIdsByProfession: ReadonlyMap<ClinicianProfessionValue, string>;
};

/** A user row as the accounts step compares it. */
export type DemoStoredAccount = {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roleCodes: string[];
};

/** What the accounts step hands to the steps after it. */
export type DemoAccountsResult = {
  lines: DemoSeedLine[];
  actorsByEmail: ReadonlyMap<string, CurrentUser>;
  /** Bootstrap logins whose public default password this run replaced. */
  resetBootstrapEmails: string[];
};

/** What the clinicians step hands to the patients step. */
export type DemoCliniciansResult = {
  lines: DemoSeedLine[];
  doctorIdsByProfession: ReadonlyMap<ClinicianProfessionValue, string>;
};

/** The base-seed facts the target check reads from the database. */
export type DemoSeedDatabaseFacts = {
  presentRoleCodes: readonly string[];
  hasPrivacyNotice: boolean;
};

/**
 * What the target check is judged on. `database` is absent on the first
 * call, made before the application context boots.
 */
export type DemoSeedTargetInput = {
  nodeEnv: string | undefined;
  database?: DemoSeedDatabaseFacts;
};
