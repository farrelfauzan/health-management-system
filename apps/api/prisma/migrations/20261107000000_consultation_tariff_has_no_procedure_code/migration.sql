-- A consultation tariff is priced by who held the visit, never by a procedure
-- code (D-037 amendment).
--
-- Mapping one to an ICD-9-CM code made a single row reachable by two
-- independent collectors: the consultation resolver, which prices the visit
-- from the clinician's poli and profession, and the procedure collector, which
-- prices coded actions by `icd9cm_code`. A clinic that priced "Konsultasi
-- Dokter Kandungan" at 350.000 and mapped it to 89.07 ("Consultation,
-- described as comprehensive") got both lines on every visit where the doctor
-- coded 89.07 -- the patient billed twice for one conversation, with nothing
-- in the invoice to explain it.

-- Drop the mappings that can only double-bill. They are data, so this is said
-- out loud rather than hidden: a CONSULTATION row's ICD-9-CM code is cleared,
-- and the procedure it used to price is reported afterwards as an unpriced
-- procedure gap -- visible, and already covered by the consultation fee.
UPDATE "service_tariffs"
  SET "icd9cm_code" = NULL, "updated_at" = NOW()
  WHERE "category" = 'CONSULTATION' AND "icd9cm_code" IS NOT NULL;

-- The same rule as `service_tariffs_room_class_category_check` and
-- `service_tariffs_consultation_audience_check`, from the other direction: a
-- column that means something on one category and nothing on the next is how
-- the two start disagreeing.
ALTER TABLE "service_tariffs"
  ADD CONSTRAINT "service_tariffs_consultation_no_icd9cm_check"
  CHECK ("category" <> 'CONSULTATION' OR "icd9cm_code" IS NULL);
