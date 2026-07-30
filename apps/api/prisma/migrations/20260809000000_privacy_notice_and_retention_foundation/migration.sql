CREATE TYPE "PrivacyNoticeOutcome" AS ENUM (
  'ACKNOWLEDGED',
  'PROVIDED_ACKNOWLEDGEMENT_DECLINED',
  'DEFERRED_EMERGENCY'
);
CREATE TYPE "PrivacyNoticeLocale" AS ENUM ('id', 'en');
CREATE TYPE "PrivacyNoticeSubjectType" AS ENUM ('SELF', 'REPRESENTATIVE');
CREATE TYPE "PrivacyNoticeProvenance" AS ENUM (
  'FRONT_DESK',
  'PATIENT_PORTAL',
  'LEGACY_IMPORT',
  'EMERGENCY'
);

ALTER TABLE "patient_profiles" ADD COLUMN "last_visit_at" TIMESTAMP(3);

UPDATE "patient_profiles" AS p
SET "last_visit_at" = visits."last_visit_at"
FROM (
  SELECT "patient_id", MAX("checked_in_at") AS "last_visit_at"
  FROM "registrations"
  WHERE "status" IN ('CHECKED_IN', 'COMPLETED') AND "checked_in_at" IS NOT NULL
  GROUP BY "patient_id"
) AS visits
WHERE p."id" = visits."patient_id";

CREATE INDEX "patient_profiles_last_visit_at_idx" ON "patient_profiles"("last_visit_at");

CREATE TABLE "privacy_notice_versions" (
  "id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "content_id" TEXT NOT NULL,
  "content_en" TEXT NOT NULL,
  "content_hash_id" TEXT NOT NULL,
  "content_hash_en" TEXT NOT NULL,
  "counsel_approved" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "privacy_notice_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_privacy_notice_records" (
  "id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "privacy_notice_version_id" UUID NOT NULL,
  "outcome" "PrivacyNoticeOutcome" NOT NULL,
  "locale" "PrivacyNoticeLocale" NOT NULL,
  "content_hash" TEXT NOT NULL,
  "subject_type" "PrivacyNoticeSubjectType" NOT NULL,
  "representative_name" TEXT,
  "representative_relation" TEXT,
  "actor_user_id" UUID NOT NULL,
  "provenance" "PrivacyNoticeProvenance" NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_privacy_notice_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patient_privacy_notice_records_representative_check" CHECK (
    ("subject_type" = 'SELF' AND "representative_name" IS NULL AND "representative_relation" IS NULL)
    OR
    ("subject_type" = 'REPRESENTATIVE' AND "representative_name" IS NOT NULL AND "representative_relation" IS NOT NULL)
  ),
  CONSTRAINT "patient_privacy_notice_records_emergency_check" CHECK (
    ("outcome" = 'DEFERRED_EMERGENCY' AND "provenance" = 'EMERGENCY')
    OR "outcome" <> 'DEFERRED_EMERGENCY'
  )
);

CREATE UNIQUE INDEX "privacy_notice_versions_version_key" ON "privacy_notice_versions"("version");
CREATE UNIQUE INDEX "privacy_notice_versions_effective_at_key"
  ON "privacy_notice_versions"("effective_at");
CREATE INDEX "patient_privacy_notice_records_patient_id_recorded_at_idx"
  ON "patient_privacy_notice_records"("patient_id", "recorded_at");
-- Prisma derives this name by truncating the column list and keeping `_idx`;
-- a hand-shortened name drifts from the schema and fails CI's `migrate diff`.
CREATE INDEX "patient_privacy_notice_records_patient_id_privacy_notice_ve_idx"
  ON "patient_privacy_notice_records"("patient_id", "privacy_notice_version_id", "outcome");
CREATE INDEX "patient_privacy_notice_records_actor_user_id_recorded_at_idx"
  ON "patient_privacy_notice_records"("actor_user_id", "recorded_at");

ALTER TABLE "patient_privacy_notice_records"
  ADD CONSTRAINT "patient_privacy_notice_records_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_privacy_notice_records"
  ADD CONSTRAINT "patient_privacy_notice_records_privacy_notice_version_id_fkey"
  FOREIGN KEY ("privacy_notice_version_id") REFERENCES "privacy_notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_privacy_notice_records"
  ADD CONSTRAINT "patient_privacy_notice_records_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clinical/payer history must block patient deletion rather than cascade away.
ALTER TABLE "patient_allergies" DROP CONSTRAINT "patient_allergies_patient_id_fkey";
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bpjs_eligibility_checks" DROP CONSTRAINT "bpjs_eligibility_checks_patient_id_fkey";
ALTER TABLE "bpjs_eligibility_checks" ADD CONSTRAINT "bpjs_eligibility_checks_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "privacy_notice_versions" (
  "id", "version", "effective_at", "content_id", "content_en",
  "content_hash_id", "content_hash_en", "counsel_approved"
) VALUES (
  'c2a3ecb0-a352-4d49-a47c-39d1b67904c9'::uuid,
  '1.0',
  '2026-07-30T00:00:00.000Z',
  $notice_id$# Pemberitahuan Privasi Pasien v1.0

Status: PLACEHOLDER DISETUJUI UNTUK IMPLEMENTASI TEKNIS; WAJIB PERSETUJUAN PENASIHAT HUKUM SEBELUM DIGUNAKAN DALAM PRODUKSI.

Klinik mengumpulkan dan menggunakan data identitas, kontak, pembayaran, dan kesehatan pasien untuk pendaftaran, pelayanan kesehatan, keselamatan pasien, administrasi, pelaporan yang diwajibkan hukum, serta integrasi layanan kesehatan nasional atau penjamin yang berlaku. Data dapat diberikan kepada tenaga kesehatan, petugas klinik yang berwenang, penyedia layanan yang terikat kewajiban kerahasiaan, dan instansi yang diwajibkan oleh hukum. Klinik menerapkan pembatasan akses dan pengamanan yang wajar. Pasien dapat meminta informasi, akses, koreksi, atau menggunakan hak lain sesuai hukum yang berlaku melalui petugas privasi klinik. Rekam medis disimpan sekurang-kurangnya selama masa retensi yang diwajibkan hukum dan kebijakan klinik.

Pencatatan bahwa pemberitahuan ini telah diberikan bukan persetujuan tindakan medis dan bukan persetujuan menyeluruh untuk seluruh pemrosesan data.
$notice_id$,
  $notice_en$# Patient Privacy Notice v1.0

Status: PLACEHOLDER APPROVED FOR TECHNICAL IMPLEMENTATION; LEGAL COUNSEL APPROVAL IS REQUIRED BEFORE PRODUCTION USE.

The clinic collects and uses patient identity, contact, payment, and health data for registration, healthcare delivery, patient safety, administration, legally required reporting, and applicable national health-service or payer integrations. Data may be disclosed to healthcare professionals, authorised clinic staff, service providers bound by confidentiality obligations, and authorities where required by law. The clinic applies reasonable access controls and safeguards. Patients may request information, access, correction, or exercise other rights available under applicable law through the clinic privacy contact. Medical records are retained for at least the period required by law and clinic policy.

Recording that this notice was provided is not consent to medical treatment and is not blanket consent for all data processing.
$notice_en$,
  '604bbdce1ce3c208b7c66ac3e0f7def249f632a24d61dcd184fa0eb9fb5e5636',
  'b5660f0e1901ca9f45767c86b1c8589156c82100e35b97c64bd5ecfd45072b52',
  false
);

CREATE FUNCTION "reject_immutable_privacy_notice_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'privacy notice evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "privacy_notice_versions_immutable"
  BEFORE UPDATE OR DELETE ON "privacy_notice_versions"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_privacy_notice_change"();
CREATE TRIGGER "patient_privacy_notice_records_append_only"
  BEFORE UPDATE OR DELETE ON "patient_privacy_notice_records"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_privacy_notice_change"();
