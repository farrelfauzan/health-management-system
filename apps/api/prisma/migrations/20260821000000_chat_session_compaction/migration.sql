-- P15-T13: conversation compaction (ai-chatbot-tools.md §6.2).
--
-- Past the 20-turn replay window older exchanges vanish and the assistant
-- contradicts things it said earlier in the same conversation. A rolling
-- summary of the dropped turns, stored here and replayed as one SYSTEM
-- message, is the fix.
--
-- `compacted_turn_count` is a count rather than a message id or a timestamp
-- on purpose: chat messages are append-only and never deleted, so the count
-- is stable, and integer arithmetic cannot be confused by two turns written
-- inside the same millisecond.
ALTER TABLE "chat_sessions"
  ADD COLUMN "compacted_summary" TEXT,
  ADD COLUMN "compacted_turn_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "compacted_at" TIMESTAMP(3);
