-- P25-T17 (SJ-240): audit verbs for visit-reminder consent. Split from the
-- tables that follow so the new values are committed before anything uses
-- them.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VISIT_REMINDER_CONSENT_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VISIT_REMINDER_CONSENT_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VISIT_REMINDER_CONSENT_OPTED_OUT';
