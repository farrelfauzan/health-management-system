-- P16-T24: the delivery channel enum and the consent audit verbs.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.
--
-- Four verbs rather than the generic CREATE/UPDATE. GRANTED and WITHDRAWN are
-- the counter's two acts; OPTED_OUT is the patient's own — `STOP` or
-- `BERHENTI` typed into WhatsApp with no staff actor — and is its own verb so a
-- revocation the patient made is never mistaken for one a clerk made.
-- CHANNEL_REFUSED records a send the gate turned away because the verified
-- number belongs to a *different* patient (FR-E4-03): the one refusal that is
-- evidence of something rather than a missing step.

-- CreateEnum
CREATE TYPE "delivery_channel" AS ENUM ('WHATSAPP', 'EMAIL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_CONSENT_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_CONSENT_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_CONSENT_OPTED_OUT';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_CHANNEL_REFUSED';
