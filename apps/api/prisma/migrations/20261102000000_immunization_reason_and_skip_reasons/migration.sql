-- Why a dose was given, as SATUSEHAT's immunization-reason code system names
-- it (P24-T12, FR-IM-03). reasonCode is mandatory on every Immunization the
-- platform accepts (RuleNumber 10105), so the values are the platform's own
-- codes with the hyphen folded into an underscore; the mapper restores it.
-- In its own migration ahead of the column that uses it: Postgres will not
-- let a type be created and then used in the same transaction as some
-- deployments run it.
CREATE TYPE "immunization_reason" AS ENUM (
    'IM_DASAR',
    'IM_BADUTA',
    'IM_SD',
    'IM_WUS',
    'IM_TAMBAHAN',
    'IM_KHUSUS',
    'IM_PILIHAN'
);

-- Three more reasons an Immunization is left out of a bundle (P24-T12). The
-- platform refuses a dose with no protocolApplied (RuleNumber 10450) or no
-- reasonCode (10105), and one refused resource fails the whole visit, so a
-- legacy row missing either is skipped and named instead. A dose given by a
-- clinician with no SATUSEHAT practitioner id cannot name its performer
-- truthfully and is skipped the same way.
ALTER TYPE "satusehat_resource_skip_reason" ADD VALUE 'IMMUNIZATION_DOSE_NUMBER_MISSING';
ALTER TYPE "satusehat_resource_skip_reason" ADD VALUE 'IMMUNIZATION_REASON_MISSING';
ALTER TYPE "satusehat_resource_skip_reason" ADD VALUE 'IMMUNIZATION_PERFORMER_UNLINKED';
