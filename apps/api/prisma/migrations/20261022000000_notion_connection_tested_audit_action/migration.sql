-- P23-T04 (SJ-191): testing the Notion bug-report connector writes an audit
-- row naming the actor and whether the Bug Board schema still matches what the
-- publisher writes. It needs its own verb: the clinic cannot configure this
-- integration, so when bug reports stop arriving the only record of who
-- looked, and what they found, is this row — and a generic READ among the
-- hundreds the admin screens produce answers neither question.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'NOTION_CONNECTION_TESTED';
