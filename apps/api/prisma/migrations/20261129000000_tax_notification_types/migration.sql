-- P27-T10 (SJ-251): three notification types for the tax calendar.
--
-- Its own migration because PostgreSQL will not let a value added to an enum
-- be used in the transaction that added it, and each migration folder is one
-- transaction.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TAX_OBLIGATION_DUE';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TAX_TURNOVER_THRESHOLD';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TAX_PP55_LAST_YEAR';
