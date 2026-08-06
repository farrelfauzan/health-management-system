-- CreateEnum
CREATE TYPE "channel_kind" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateTable
CREATE TABLE "channel_inbound_receipts" (
    "id" UUID NOT NULL,
    "channel" "channel_kind" NOT NULL,
    "external_chat_id" TEXT NOT NULL,
    "external_message_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_inbound_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_inbound_receipts_created_at_idx" ON "channel_inbound_receipts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_inbound_receipts_channel_external_chat_id_external__key" ON "channel_inbound_receipts"("channel", "external_chat_id", "external_message_id");

