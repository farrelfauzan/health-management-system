-- PCS-T08: the human side of the WhatsApp/Telegram channel — admin inbox,
-- takeover, and §8.3's chat block.
--
-- Two columns and one index, and each answers a question the admin screens ask
-- that no existing column can.

-- AlterTable
-- A block is recorded as a nullable timestamp plus its author rather than a
-- sixth `conversation_state`, because it is a policy overlay and a state is a
-- position in a lifecycle: blocking a chat a colleague is mid-conversation on
-- must not erase `HUMAN_ACTIVE`, and unblocking must return the chat to where
-- it was rather than to a guess.
ALTER TABLE "conversations"
  ADD COLUMN "blocked_at" TIMESTAMP(3),
  ADD COLUMN "blocked_by_id" UUID;

-- AlterTable
-- Which staff member wrote an ADMIN turn. Null for every other role, because
-- nobody wrote them.
ALTER TABLE "conversation_messages"
  ADD COLUMN "author_user_id" UUID;

-- CreateIndex
-- The inbox's default ordering. `(state, last_message_at)` already serves a
-- filtered queue, but a leading equality column cannot serve the unfiltered
-- list, which is the screen an admin opens first.
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- AddForeignKey
-- `SET NULL` on both: a transcript must survive a leaver. A turn whose author
-- has left the clinic is still an accurate record of what the customer was
-- told, and a block whose author left is still a block.
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_blocked_by_id_fkey"
  FOREIGN KEY ("blocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
