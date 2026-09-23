-- P28-T01 (SJ-261): the enum values a moved or cancelled practice session needs.
--
-- Its own migration because PostgreSQL will not let a value added to an enum
-- be used in the transaction that added it, and each migration folder is one
-- transaction.
ALTER TYPE "AppointmentSessionStatus" ADD VALUE IF NOT EXISTS 'MOVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'APPOINTMENT_RESCHEDULED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'APPOINTMENT_SESSION_CANCELLED';
