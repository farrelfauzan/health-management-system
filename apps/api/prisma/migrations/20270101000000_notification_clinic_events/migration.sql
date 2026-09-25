-- D-048: the bell rows that hand a visit from one role to the next.
--
-- Values only, with nothing in this folder using them: PostgreSQL will not let
-- a value added to an enum be used in the transaction that added it, and no
-- CHECK or default here needs them, so one folder is enough.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'LAB_ORDER_CREATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'PATIENT_CHECKED_IN';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'PATIENT_ASSIGNED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'CLINICIAN_JOINED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'STAFF_JOINED';
