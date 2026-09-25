-- The seeded description of the INVOICE_TEMPLATE document type carried an
-- internal backlog code in brackets, which the document-types screen shows to
-- clinic staff. The seed owns only `code`, `behavior` and `is_system` on
-- re-run (the description is the clinic's), so a re-seed cannot correct rows
-- that already exist. This rewrites the description only where it is still
-- exactly the seeded text: a clinic that edited it keeps its own wording.
UPDATE "document_types"
SET "description" = 'Tata letak kuitansi dan faktur',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'INVOICE_TEMPLATE'
  AND "description" = 'Tata letak kuitansi dan faktur (E1)';
