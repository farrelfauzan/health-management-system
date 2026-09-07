-- P18-T02 (SJ-142): the lab-ordering enums, and the audit verbs the order
-- routes write.
--
-- Split from the tables that follow, as every enum change in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it, and the
-- tables below default `status` to 'ORDERED'.

-- CreateEnum
CREATE TYPE "lab_order_status" AS ENUM ('ORDERED', 'COLLECTED', 'IN_PROGRESS', 'RESULTED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "lab_order_item_status" AS ENUM ('PENDING', 'RESULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "lab_order_priority" AS ENUM ('ROUTINE', 'URGENT');

-- Named verbs rather than generic CREATE/UPDATE rows: "who ordered a test on
-- this patient" and "who cancelled one and why" are different questions, and
-- an UPDATE row looks identical for both.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_ORDER_CREATED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_ORDER_CANCELLED';
