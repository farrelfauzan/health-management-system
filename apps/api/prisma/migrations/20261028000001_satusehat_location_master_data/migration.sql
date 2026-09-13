-- Location master data for SATUSEHAT (P24-T05, FR-LOC-01/02/05). Data only:
-- registering the tree is P24-T06, and using the ids in a bundle is P24-T07/T08.
-- Every column is nullable and nothing is backfilled, so a deployment that has
-- registered nothing keeps sending `SATUSEHAT_LOCATION_ID` exactly as before.

-- Decimal degrees for `Location.position`. The platform does not enforce
-- position on staging (P24-T01), so requiring both before registration is the
-- clinic's own rule, checked in the service.
ALTER TABLE "clinic_profiles"
    ADD COLUMN "latitude" DECIMAL(9,6),
    ADD COLUMN "longitude" DECIMAL(9,6),
    ADD COLUMN "satusehat_location_id" TEXT;

-- One SATUSEHAT Location id per registrable row: poli (`ro`), ward (`wa`),
-- room (`ro`) and bed (`bd`).
ALTER TABLE "specialties" ADD COLUMN "satusehat_location_id" TEXT;
ALTER TABLE "wards" ADD COLUMN "satusehat_location_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN "satusehat_location_id" TEXT;
ALTER TABLE "beds" ADD COLUMN "satusehat_location_id" TEXT;

-- Null means unmapped: rooms of that class cannot be registered.
ALTER TABLE "room_classes" ADD COLUMN "satusehat_service_class" "satusehat_service_class";
