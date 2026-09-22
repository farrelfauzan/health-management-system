-- P27-T08 (SJ-249): the clinician's PTKP status, which DJP's BP21 v4 schema
-- requires on every bukti potong line. The bukan pegawai tax never reads it
-- (50% x Pasal 17, non-cumulative), so it is nullable and a missing value
-- blocks only the Coretax XML export, never the draft.

-- CreateEnum
CREATE TYPE "ptkp_status" AS ENUM ('TK_0', 'TK_1', 'TK_2', 'TK_3', 'K_0', 'K_1', 'K_2', 'K_3');

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "ptkp_status" "ptkp_status";
