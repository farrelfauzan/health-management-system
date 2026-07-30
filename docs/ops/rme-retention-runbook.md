# RME Retention Candidate Runbook

1. Confirm `RME_RETENTION_YEARS` is at least 25 and matches the approved policy.
2. Run `apps/api/prisma/reports/rme-retention-candidates.sql` using a read-only database account, supplying `retention_years` through `psql -v`.
3. Export only the minimum fields required for records-officer review and store the report in an access-controlled location.
4. Treat every result as a candidate, not deletion approval. Exclude legal holds, open registrations, active encounters, unsettled prescriptions, billing or payer obligations, and any other preservation duty.
5. Obtain written records-officer and legal approval before any future disposal workflow. This release intentionally provides no deletion command or HTTP endpoint.
6. Destroy temporary report exports according to the clinic security procedure after review.
