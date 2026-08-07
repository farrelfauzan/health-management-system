-- CreateEnum
CREATE TYPE "conversation_state" AS ENUM ('BOT_ACTIVE', 'NEEDS_HUMAN', 'HUMAN_ACTIVE', 'AWAITING_OTP', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "conversation_message_role" AS ENUM ('CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "channel" "channel_kind" NOT NULL,
    "external_chat_id" TEXT NOT NULL,
    "sender_display_name" TEXT,
    "state" "conversation_state" NOT NULL DEFAULT 'BOT_ACTIVE',
    "has_sent_notice" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "conversation_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "safety_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_state_last_message_at_idx" ON "conversations"("state", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_external_chat_id_key" ON "conversations"("channel", "external_chat_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

