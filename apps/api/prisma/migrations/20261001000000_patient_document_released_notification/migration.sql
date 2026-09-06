-- P16-T40: the bell the attending doctor gets when a clinical document is
-- released (FR-E4-25) — the doctor's end of dual delivery (§7.4.5). Enum
-- addition only; the delivery rows a release can create reuse
-- `document_deliveries` through its existing `document_id` branch (D-028).

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'PATIENT_DOCUMENT_RELEASED';
