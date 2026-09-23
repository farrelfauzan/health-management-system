-- P27-T09 (SJ-250): what DJP's Faktur Keluaran template (converter v1.6,
-- sample XML v1.4, pajak.go.id node 112031) needs on every faktur line and
-- does not find in the invoice snapshot: the six-digit goods/services code
-- ("Kode Barang Jasa") and the unit of measure ("Nama Satuan Ukur", UM.0001
-- to UM.0039 in the template's REF sheet). Set on the tax code, overridable
-- per tariff and per medication. A kode-08 tax code also carries the
-- exemption facility: keterangan tambahan (TD.005xx) and cap fasilitas
-- (TD.011xx), from the template's REF-KetTambahan and REF-CapFasilitas.
-- All nullable: nothing is known until the clinic chooses, and a missing
-- code blocks only the Coretax XML export, never billing.

-- AlterTable
ALTER TABLE "tax_codes" ADD COLUMN "coretax_item_code" VARCHAR(6),
ADD COLUMN "coretax_unit_code" VARCHAR(7),
ADD COLUMN "coretax_additional_info" VARCHAR(8),
ADD COLUMN "coretax_facility_stamp" VARCHAR(8);

-- AlterTable
ALTER TABLE "service_tariffs" ADD COLUMN "coretax_item_code" VARCHAR(6),
ADD COLUMN "coretax_unit_code" VARCHAR(7);

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "coretax_item_code" VARCHAR(6),
ADD COLUMN "coretax_unit_code" VARCHAR(7);

ALTER TABLE "tax_codes"
    ADD CONSTRAINT "tax_codes_coretax_item_code_check" CHECK (
        "coretax_item_code" IS NULL OR "coretax_item_code" ~ '^[0-9]{6}$'
    ),
    ADD CONSTRAINT "tax_codes_coretax_unit_code_check" CHECK (
        "coretax_unit_code" IS NULL OR "coretax_unit_code" ~ '^UM\.[0-9]{4}$'
    ),
    ADD CONSTRAINT "tax_codes_coretax_additional_info_check" CHECK (
        "coretax_additional_info" IS NULL OR "coretax_additional_info" ~ '^TD\.005[0-9]{2}$'
    ),
    ADD CONSTRAINT "tax_codes_coretax_facility_stamp_check" CHECK (
        "coretax_facility_stamp" IS NULL OR "coretax_facility_stamp" ~ '^TD\.011[0-9]{2}$'
    );

ALTER TABLE "service_tariffs"
    ADD CONSTRAINT "service_tariffs_coretax_item_code_check" CHECK (
        "coretax_item_code" IS NULL OR "coretax_item_code" ~ '^[0-9]{6}$'
    ),
    ADD CONSTRAINT "service_tariffs_coretax_unit_code_check" CHECK (
        "coretax_unit_code" IS NULL OR "coretax_unit_code" ~ '^UM\.[0-9]{4}$'
    );

ALTER TABLE "medications"
    ADD CONSTRAINT "medications_coretax_item_code_check" CHECK (
        "coretax_item_code" IS NULL OR "coretax_item_code" ~ '^[0-9]{6}$'
    ),
    ADD CONSTRAINT "medications_coretax_unit_code_check" CHECK (
        "coretax_unit_code" IS NULL OR "coretax_unit_code" ~ '^UM\.[0-9]{4}$'
    );
