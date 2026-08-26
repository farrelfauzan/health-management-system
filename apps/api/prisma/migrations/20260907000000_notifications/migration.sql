-- In-app notifications (IMP-21). One append-only table: a row per recipient
-- per event, `read_at` doubling as the unread flag. `title_key`/`body_key`
-- are i18n message keys with `params` as the ICU values — the API stores no
-- rendered copy, so translations stay a frontend concern. Delivery is
-- polling (the shell asks for a count), so there is no dispatch state here.
-- `user_id` cascades with the user: a notification is meaningless without
-- its recipient, unlike audit rows which outlive their actors.

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('APPOINTMENT_APPROVED', 'APPOINTMENT_REJECTED', 'CONVERSATION_HANDOFF');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title_key" TEXT NOT NULL,
    "body_key" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "href" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_deleted_at_idx" ON "notifications"("deleted_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
