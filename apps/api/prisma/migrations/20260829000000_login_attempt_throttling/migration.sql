-- SJ-7: per-account and per-IP login throttling.
--
-- One row per login attempt. `identifier_hash` is a SHA-256 of the lowercased
-- email rather than the address: the table necessarily records what was
-- *typed*, including typos and addresses belonging to nobody, and throttling
-- only ever asks whether recent failures share an identifier — which equality
-- answers without keeping a list of people's email addresses.

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "identifier_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "succeeded" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The two throttle questions, and the sweeper's.
CREATE INDEX "login_attempts_identifier_hash_created_at_idx" ON "login_attempts"("identifier_hash", "created_at");
CREATE INDEX "login_attempts_ip_address_created_at_idx" ON "login_attempts"("ip_address", "created_at");
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts"("created_at");
