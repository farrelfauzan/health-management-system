-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('OPENAI', 'DEEPSEEK', 'ANTHROPIC', 'OLLAMA', 'OPENAI_COMPATIBLE', 'AZURE_OPENAI');

-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('PATIENT', 'DOCTOR');

-- CreateEnum
CREATE TYPE "ChatActor" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "provider_kind" "AiProviderKind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "api_key_ciphertext" TEXT NOT NULL,
    "api_key_hint" TEXT NOT NULL,
    "credential_key_version" INTEGER NOT NULL DEFAULT 1,
    "base_url" TEXT,
    "default_model" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_tokens" INTEGER NOT NULL DEFAULT 2048,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "last_tested_at" TIMESTAMP(3),
    "last_test_result" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "channel" "ChatChannel" NOT NULL DEFAULT 'PATIENT',
    "provider_key" TEXT NOT NULL,
    "provider_kind" "AiProviderKind" NOT NULL,
    "provider_session_id" TEXT,
    "provider_metadata" JSONB,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "author_user_id" UUID,
    "actor" "ChatActor" NOT NULL,
    "content" TEXT NOT NULL,
    "provider_kind" "AiProviderKind",
    "provider_request_id" TEXT,
    "provider_message_id" TEXT,
    "provider_model" TEXT,
    "provider_status_code" INTEGER,
    "provider_latency_ms" INTEGER,
    "provider_metadata" JSONB,
    "disclaimer_shown" BOOLEAN NOT NULL DEFAULT false,
    "safety_tags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_configs_facility_id_is_active_idx" ON "ai_provider_configs"("facility_id", "is_active");

-- CreateIndex
CREATE INDEX "ai_provider_configs_deleted_at_idx" ON "ai_provider_configs"("deleted_at");

-- CreateIndex
CREATE INDEX "chat_sessions_owner_user_id_idx" ON "chat_sessions"("owner_user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_provider_key_idx" ON "chat_sessions"("provider_key");

-- CreateIndex
CREATE INDEX "chat_sessions_channel_idx" ON "chat_sessions"("channel");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_author_user_id_idx" ON "chat_messages"("author_user_id");

-- CreateIndex
CREATE INDEX "chat_messages_provider_request_id_idx" ON "chat_messages"("provider_request_id");

-- CreateIndex
CREATE INDEX "chat_messages_provider_message_id_idx" ON "chat_messages"("provider_message_id");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written index below. Prisma cannot express partial or expression unique
-- indexes and `migrate diff` ignores them, so CI's drift gate stays green (same
-- approach as the BPJS config and invoice migrations).
--
-- "exactly one active provider per facility" is the whole routing contract: a
-- second active row means two credential sets both claim the next chat turn and
-- the resolver picks arbitrarily. A plain unique on (facility_id, is_active)
-- cannot express it — it would also forbid a second *inactive* row, which is
-- precisely how an admin stages a replacement config before cutting over. So
-- the uniqueness is partial: only rows that are live (is_active) and not
-- soft-deleted participate.
--
-- facility_id is COALESCEd to the nil-UUID sentinel (MrnCounter's convention)
-- because HMS ships single-facility: the live deployment's rows carry NULL, and
-- Postgres treats NULLs as distinct, so without the COALESCE the facility-less
-- case — the only case that exists today — would be entirely unguarded.
CREATE UNIQUE INDEX "ai_provider_configs_active_per_facility_key"
    ON "ai_provider_configs" (COALESCE("facility_id", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "is_active" AND "deleted_at" IS NULL;
