-- Read-only candidate report. Example: psql -v retention_years=25 -f this-file
-- Results are not deletion approval; apply legal holds and operational review.
SELECT
  p.id,
  p.mrn,
  p.last_visit_at,
  p.last_visit_at + (:'retention_years' || ' years')::interval AS candidate_after
FROM patient_profiles AS p
WHERE p.deleted_at IS NULL
  AND p.last_visit_at IS NOT NULL
  AND p.last_visit_at <= CURRENT_TIMESTAMP - (:'retention_years' || ' years')::interval
ORDER BY p.last_visit_at ASC;
