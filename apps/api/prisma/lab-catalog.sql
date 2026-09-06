-- P18-T01 (SJ-141): the laboratory catalog a klinik pratama actually runs.
--
-- Run by `pnpm db:seed` after `seed.sql`, and idempotent: every statement is
-- an upsert keyed on the natural code, so re-running is a no-op and a clinic's
-- own edits to price or activation are not stamped back.
--
-- LOINC codes are copied from the LOINC table, which is Copyright (c)
-- 1995-2024 Regenstrief Institute, Inc. and the LOINC Committee, and is
-- available at no cost under the LOINC licence
-- (https://loinc.org/license/). Codes are used here as identifiers, which is
-- what the licence permits; nothing in this file redistributes the LOINC
-- table itself.
--
-- Tests without a LOINC code (Widal, feses rutin) are seeded with NULL rather
-- than a nearest-match code: an uncoded test is usable locally and simply not
-- reported to SATUSEHAT, which is the KFA rule applied to laboratory work.
--
-- Reference ranges are **adult** ranges. Paediatric bands are deliberately
-- absent: the entry form shows "tidak ada rentang rujukan" rather than
-- flagging a child's result against an adult standard, which would be worse
-- than showing nothing.

BEGIN;

WITH seed_lab_tests(code, name, loinc_code, loinc_display, specimen_type, result_type, unit, decimals, coded_options) AS (
  VALUES
    ('HB', 'Hemoglobin', '718-7', 'Hemoglobin [Mass/volume] in Blood', 'WHOLE_BLOOD', 'NUMERIC', 'g/dL', 1, ARRAY[]::TEXT[]),
    ('LEUKO', 'Leukosit', '6690-2', 'Leukocytes [#/volume] in Blood by Automated count', 'WHOLE_BLOOD', 'NUMERIC', '10*3/uL', 1, ARRAY[]::TEXT[]),
    ('TROMBO', 'Trombosit', '777-3', 'Platelets [#/volume] in Blood by Automated count', 'WHOLE_BLOOD', 'NUMERIC', '10*3/uL', 0, ARRAY[]::TEXT[]),
    ('HCT', 'Hematokrit', '4544-3', 'Hematocrit [Volume Fraction] of Blood by Automated count', 'WHOLE_BLOOD', 'NUMERIC', '%', 1, ARRAY[]::TEXT[]),
    ('ERI', 'Eritrosit', '789-8', 'Erythrocytes [#/volume] in Blood by Automated count', 'WHOLE_BLOOD', 'NUMERIC', '10*6/uL', 2, ARRAY[]::TEXT[]),
    ('LED', 'Laju Endap Darah', '30341-2', 'Erythrocyte sedimentation rate', 'WHOLE_BLOOD', 'NUMERIC', 'mm/h', 0, ARRAY[]::TEXT[]),
    ('GDS', 'Glukosa Darah Sewaktu', '2345-7', 'Glucose [Mass/volume] in Serum or Plasma', 'PLASMA', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('GDP', 'Glukosa Darah Puasa', '1558-6', 'Fasting glucose [Mass/volume] in Serum or Plasma', 'PLASMA', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('GD2PP', 'Glukosa 2 Jam Post Prandial', '1521-4', 'Glucose [Mass/volume] in Serum or Plasma --2 hours post meal', 'PLASMA', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('HBA1C', 'HbA1c', '4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood', 'WHOLE_BLOOD', 'NUMERIC', '%', 1, ARRAY[]::TEXT[]),
    ('KOLTOT', 'Kolesterol Total', '2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('HDL', 'Kolesterol HDL', '2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('LDL', 'Kolesterol LDL', '18262-6', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay', 'SERUM', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('TG', 'Trigliserida', '2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('URIC', 'Asam Urat', '3084-1', 'Urate [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 1, ARRAY[]::TEXT[]),
    ('UREUM', 'Ureum', '3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 0, ARRAY[]::TEXT[]),
    ('KREA', 'Kreatinin', '2160-0', 'Creatinine [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 2, ARRAY[]::TEXT[]),
    ('SGOT', 'SGOT (AST)', '1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'U/L', 0, ARRAY[]::TEXT[]),
    ('SGPT', 'SGPT (ALT)', '1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'U/L', 0, ARRAY[]::TEXT[]),
    ('BILTOT', 'Bilirubin Total', '1975-2', 'Bilirubin.total [Mass/volume] in Serum or Plasma', 'SERUM', 'NUMERIC', 'mg/dL', 2, ARRAY[]::TEXT[]),
    ('GOLDAR', 'Golongan Darah ABO', '882-1', 'ABO group [Type] in Blood', 'WHOLE_BLOOD', 'CODED', NULL, 0, ARRAY['A','B','AB','O']::TEXT[]),
    ('WIDAL', 'Widal', NULL, NULL, 'SERUM', 'TEXT', NULL, 0, ARRAY[]::TEXT[]),
    ('HBSAG', 'HBsAg', '5195-3', 'Hepatitis B virus surface Ag [Presence] in Serum', 'SERUM', 'CODED', NULL, 0, ARRAY['Non-reaktif','Reaktif']::TEXT[]),
    ('ANTIHIV', 'Anti-HIV', '75622-1', 'HIV 1 and 2 Ab [Presence] in Serum or Plasma by Rapid immunoassay', 'SERUM', 'CODED', NULL, 0, ARRAY['Non-reaktif','Reaktif']::TEXT[]),
    ('HCGURIN', 'hCG Urin', '2106-3', 'Choriogonadotropin [Presence] in Urine', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[]),
    ('NS1', 'Dengue NS1', '72258-8', 'Dengue virus NS1 Ag [Presence] in Serum or Plasma by Immunoassay', 'SERUM', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[]),
    ('URPH', 'Urin - pH', '5803-2', 'pH of Urine by Test strip', 'URINE', 'NUMERIC', '[pH]', 1, ARRAY[]::TEXT[]),
    ('URPROT', 'Urin - Protein', '5804-0', 'Protein [Mass/volume] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','+1','+2','+3','+4']::TEXT[]),
    ('URGLU', 'Urin - Glukosa', '5792-7', 'Glucose [Mass/volume] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','+1','+2','+3','+4']::TEXT[]),
    ('URLEU', 'Urin - Leukosit Esterase', '5799-2', 'Leukocyte esterase [Presence] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','+1','+2','+3']::TEXT[]),
    ('URNIT', 'Urin - Nitrit', '5802-4', 'Nitrite [Presence] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[]),
    ('URBLD', 'Urin - Darah Samar', '5794-3', 'Hemoglobin [Presence] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','+1','+2','+3']::TEXT[]),
    ('URBIL', 'Urin - Bilirubin', '5770-3', 'Bilirubin.total [Presence] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[]),
    ('URKET', 'Urin - Keton', '5797-6', 'Ketones [Mass/volume] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Negatif','+1','+2','+3']::TEXT[]),
    ('URUROB', 'Urin - Urobilinogen', '5818-0', 'Urobilinogen [Mass/volume] in Urine by Test strip', 'URINE', 'CODED', NULL, 0, ARRAY['Normal','Meningkat']::TEXT[]),
    ('URBJ', 'Urin - Berat Jenis', '5811-5', 'Specific gravity of Urine by Test strip', 'URINE', 'NUMERIC', '1', 3, ARRAY[]::TEXT[]),
    ('MALARIA', 'Malaria (apusan darah tepi)', '32700-7', 'Plasmodium sp identified in Blood by Light microscopy', 'WHOLE_BLOOD', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[]),
    ('BTA', 'BTA Sputum', '11545-1', 'Mycobacterium sp identified in Sputum by Acid fast stain', 'SPUTUM', 'CODED', NULL, 0, ARRAY['Negatif','1+','2+','3+']::TEXT[]),
    ('FESEDIM', 'Feses Rutin', NULL, NULL, 'STOOL', 'TEXT', NULL, 0, ARRAY[]::TEXT[]),
    ('ASO', 'ASTO', '5039-3', 'Streptococcus sp Ab [Units/volume] in Serum', 'SERUM', 'CODED', NULL, 0, ARRAY['Negatif','Positif']::TEXT[])
)
INSERT INTO "lab_tests" (
  "id", "code", "name", "loinc_code", "loinc_display",
  "specimen_type", "result_type", "unit", "decimals", "coded_options",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  s.code,
  s.name,
  s.loinc_code,
  s.loinc_display,
  s.specimen_type::"lab_specimen_type",
  s.result_type::"lab_result_type",
  s.unit,
  s.decimals,
  s.coded_options,
  NOW(),
  NOW()
FROM seed_lab_tests s
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "loinc_code" = EXCLUDED."loinc_code",
  "loinc_display" = EXCLUDED."loinc_display",
  "specimen_type" = EXCLUDED."specimen_type",
  "result_type" = EXCLUDED."result_type",
  "unit" = EXCLUDED."unit",
  "decimals" = EXCLUDED."decimals",
  "coded_options" = EXCLUDED."coded_options",
  "updated_at" = NOW();

-- Ranges are replaced wholesale for the seeded tests only: the set is what
-- defines "normal", and merging row by row would leave a clinic with one
-- corrected band beside a stale one.
DELETE FROM "lab_reference_ranges"
WHERE "lab_test_id" IN (
  SELECT "id" FROM "lab_tests" WHERE "code" IN (
    'ANTIHIV',
    'ASO',
    'BILTOT',
    'BTA',
    'ERI',
    'GD2PP',
    'GDP',
    'GDS',
    'GOLDAR',
    'HB',
    'HBA1C',
    'HBSAG',
    'HCGURIN',
    'HCT',
    'HDL',
    'KOLTOT',
    'KREA',
    'LDL',
    'LED',
    'LEUKO',
    'MALARIA',
    'NS1',
    'SGOT',
    'SGPT',
    'TG',
    'TROMBO',
    'URBIL',
    'URBJ',
    'URBLD',
    'UREUM',
    'URGLU',
    'URIC',
    'URKET',
    'URLEU',
    'URNIT',
    'URPH',
    'URPROT',
    'URUROB'
  )
);

WITH seed_ranges(test_code, sex, low, high, critical_low, critical_high, text_normal) AS (
  VALUES
    ('HB', 'MALE', 13.2, 17.3, 7.0, 20.0, NULL),
    ('HB', 'FEMALE', 11.7, 15.5, 7.0, 20.0, NULL),
    ('LEUKO', NULL, 4.0, 11.0, 1.5, 30.0, NULL),
    ('TROMBO', NULL, 150, 440, 50, 1000, NULL),
    ('HCT', 'MALE', 40, 52, NULL, NULL, NULL),
    ('HCT', 'FEMALE', 35, 47, NULL, NULL, NULL),
    ('ERI', 'MALE', 4.4, 5.9, NULL, NULL, NULL),
    ('ERI', 'FEMALE', 3.8, 5.2, NULL, NULL, NULL),
    ('LED', 'MALE', 0, 15, NULL, NULL, NULL),
    ('LED', 'FEMALE', 0, 20, NULL, NULL, NULL),
    ('GDS', NULL, 70, 140, 50, 400, NULL),
    ('GDP', NULL, 70, 100, 50, 400, NULL),
    ('GD2PP', NULL, 70, 140, 50, 400, NULL),
    ('HBA1C', NULL, 4.0, 5.6, NULL, NULL, NULL),
    ('KOLTOT', NULL, 0, 200, NULL, NULL, NULL),
    ('HDL', 'MALE', 40, NULL, NULL, NULL, NULL),
    ('HDL', 'FEMALE', 50, NULL, NULL, NULL, NULL),
    ('LDL', NULL, 0, 100, NULL, NULL, NULL),
    ('TG', NULL, 0, 150, NULL, NULL, NULL),
    ('URIC', 'MALE', 3.4, 7.0, NULL, NULL, NULL),
    ('URIC', 'FEMALE', 2.4, 6.0, NULL, NULL, NULL),
    ('UREUM', NULL, 15, 40, NULL, 100, NULL),
    ('KREA', 'MALE', 0.7, 1.3, NULL, 5.0, NULL),
    ('KREA', 'FEMALE', 0.6, 1.1, NULL, 5.0, NULL),
    ('SGOT', NULL, 0, 40, NULL, NULL, NULL),
    ('SGPT', NULL, 0, 41, NULL, NULL, NULL),
    ('BILTOT', NULL, 0.1, 1.2, NULL, NULL, NULL),
    ('URPH', NULL, 4.6, 8.0, NULL, NULL, NULL),
    ('URBJ', NULL, 1.005, 1.03, NULL, NULL, NULL),
    ('GOLDAR', NULL, NULL, NULL, NULL, NULL, NULL),
    ('HBSAG', NULL, NULL, NULL, NULL, NULL, 'Non-reaktif'),
    ('ANTIHIV', NULL, NULL, NULL, NULL, NULL, 'Non-reaktif'),
    ('HCGURIN', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('NS1', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URPROT', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URGLU', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URLEU', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URNIT', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URBLD', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URBIL', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URKET', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('URUROB', NULL, NULL, NULL, NULL, NULL, 'Normal'),
    ('MALARIA', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('BTA', NULL, NULL, NULL, NULL, NULL, 'Negatif'),
    ('ASO', NULL, NULL, NULL, NULL, NULL, 'Negatif')
)
INSERT INTO "lab_reference_ranges" (
  "id", "lab_test_id", "sex", "low", "high", "critical_low", "critical_high", "text_normal",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  t."id",
  CASE WHEN r.sex IS NULL THEN NULL ELSE r.sex::"PatientSex" END,
  r.low::DECIMAL(12,4),
  r.high::DECIMAL(12,4),
  r.critical_low::DECIMAL(12,4),
  r.critical_high::DECIMAL(12,4),
  r.text_normal,
  NOW(),
  NOW()
FROM seed_ranges r
JOIN "lab_tests" t ON t."code" = r.test_code
-- A range with nothing in it says nothing; GOLDAR is listed above only so the
-- delete above clears any stale row for it.
WHERE r.low IS NOT NULL OR r.high IS NOT NULL OR r.text_normal IS NOT NULL;

WITH seed_panels(code, name) AS (
  VALUES
    ('DARAH-RUTIN', 'Darah Rutin'),
    ('PROFIL-LIPID', 'Profil Lipid'),
    ('FUNGSI-HATI', 'Fungsi Hati'),
    ('FUNGSI-GINJAL', 'Fungsi Ginjal'),
    ('URIN-RUTIN', 'Urin Rutin')
)
INSERT INTO "lab_panels" ("id", "code", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), s.code, s.name, NOW(), NOW()
FROM seed_panels s
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "updated_at" = NOW();

WITH seed_members(panel_code, test_code, sort_order) AS (
  VALUES
    ('DARAH-RUTIN', 'HB', 1),
    ('DARAH-RUTIN', 'LEUKO', 2),
    ('DARAH-RUTIN', 'TROMBO', 3),
    ('DARAH-RUTIN', 'HCT', 4),
    ('DARAH-RUTIN', 'ERI', 5),
    ('DARAH-RUTIN', 'LED', 6),
    ('PROFIL-LIPID', 'KOLTOT', 1),
    ('PROFIL-LIPID', 'HDL', 2),
    ('PROFIL-LIPID', 'LDL', 3),
    ('PROFIL-LIPID', 'TG', 4),
    ('FUNGSI-HATI', 'SGOT', 1),
    ('FUNGSI-HATI', 'SGPT', 2),
    ('FUNGSI-HATI', 'BILTOT', 3),
    ('FUNGSI-GINJAL', 'UREUM', 1),
    ('FUNGSI-GINJAL', 'KREA', 2),
    ('FUNGSI-GINJAL', 'URIC', 3),
    ('URIN-RUTIN', 'URPH', 1),
    ('URIN-RUTIN', 'URBJ', 2),
    ('URIN-RUTIN', 'URPROT', 3),
    ('URIN-RUTIN', 'URGLU', 4),
    ('URIN-RUTIN', 'URLEU', 5),
    ('URIN-RUTIN', 'URNIT', 6),
    ('URIN-RUTIN', 'URBLD', 7),
    ('URIN-RUTIN', 'URBIL', 8),
    ('URIN-RUTIN', 'URKET', 9),
    ('URIN-RUTIN', 'URUROB', 10)
)
INSERT INTO "lab_panel_members" ("panel_id", "lab_test_id", "sort_order", "created_at")
SELECT p."id", t."id", m.sort_order, NOW()
FROM seed_members m
JOIN "lab_panels" p ON p."code" = m.panel_code
JOIN "lab_tests" t ON t."code" = m.test_code
ON CONFLICT ("panel_id", "lab_test_id") DO UPDATE
SET "sort_order" = EXCLUDED."sort_order";

COMMIT;
