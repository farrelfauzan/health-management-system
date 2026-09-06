-- Manual invoice lines: a cashier can attach a service tariff to a DRAFT
-- invoice by hand (a tariff with no ICD-9-CM mapping, or an OTHER charge,
-- has no other way onto the bill) and take a line off again. Both change the
-- money a patient is asked for, so both leave an audit event naming who did
-- it, on which invoice, and what the line was.
--
-- Additive only. Postgres cannot drop an enum value, so this is one-way — but
-- adding a value neither rewrites rows nor invalidates an index.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_ITEM_ADDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_ITEM_REMOVED';
