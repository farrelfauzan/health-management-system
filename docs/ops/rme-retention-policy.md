# RME Retention Policy Foundation

Status: operational baseline; legal counsel and the clinic records officer must approve the production policy.

## Rule

Electronic medical record (RME) data is retained for at least `RME_RETENTION_YEARS`, which the application rejects below 25 years. The candidate date is calculated from `PatientProfile.lastVisitAt`; patients without a reliable last visit are never automatic candidates.

This foundation does not authorise deletion. Legal hold, active care, audit, billing, payer, statutory, dispute, and preservation requirements override candidate age. Privacy-notice evidence and published notice versions are permanent evidence and must not be purged through an RME purge.

## Controls

- Production must explicitly set `RME_RETENTION_YEARS` and record policy approval.
- Clinical and evidence foreign keys use `RESTRICT` where deleting a parent could erase history.
- The candidate report is read-only SQL. There is no purge HTTP endpoint.
- Any future deletion job requires counsel approval, records-officer approval, legal-hold support, a dry run, dual authorisation, immutable audit output, tested backups, and a separate reviewed migration/release.

## Ownership

The clinic records officer owns retention decisions. Engineering owns enforcement and reporting. Legal counsel approves the legal basis, notice text, hold conditions, and final disposal procedure.
