-- P14-T05: Antrean Online publishing rides the existing BPJS outbox.
--
-- Three new submission types on the table the PCare outbox already uses, so
-- the worker, the exponential backoff, the retry endpoint and the P11-T07
-- monitor all pick them up without a second copy of any of it. No new table
-- and no new worker: the evaluation §4.4 asked for this explicitly, and two
-- retry policies to keep in step is the failure mode it was avoiding.
--
-- Nothing here enqueues anything. Rows appear only once a facility has an
-- active BpjsAntreanConfig, so a clinic without antrean bridging sees no
-- change at all.

-- AlterEnum
ALTER TYPE "BpjsSubmissionType" ADD VALUE 'ANTREAN_ADD';
ALTER TYPE "BpjsSubmissionType" ADD VALUE 'ANTREAN_PANGGIL';
ALTER TYPE "BpjsSubmissionType" ADD VALUE 'ANTREAN_BATAL';
