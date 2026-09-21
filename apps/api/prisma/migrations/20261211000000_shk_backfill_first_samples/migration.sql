-- P25-T10 (SJ-233): give every live baby recorded before SHK tracking shipped
-- her first sample row, so she reaches the worklist at all.
--
-- Data only; the schema is unchanged. The window is the ordinary one — the
-- birth plus 48 and 72 hours — with no age bound, so a baby born weeks ago
-- appears as OVERDUE. That is the truthful reading: nobody recorded a heel
-- prick for her, and the clinician decides whether one is still worth taking.
-- `gen_random_uuid()` is what the pharmacy receipt backfill used.
INSERT INTO "shk_screenings" (
  "id", "newborn_care_record_id", "sequence", "due_from", "due_until", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  n."id",
  1,
  d."birth_at" + INTERVAL '48 hours',
  d."birth_at" + INTERVAL '72 hours',
  NOW(),
  NOW()
FROM "newborn_care_records" n
JOIN "delivery_records" d ON d."id" = n."delivery_record_id"
WHERE n."outcome" = 'LIVE_BIRTH'
  AND NOT EXISTS (
    SELECT 1 FROM "shk_screenings" s WHERE s."newborn_care_record_id" = n."id"
  );
