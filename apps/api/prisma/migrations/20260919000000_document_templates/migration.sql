-- CreateEnum
CREATE TYPE "DocumentTemplateKind" AS ENUM ('INVOICE');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "kind" "DocumentTemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "content_html" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content_html" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_kind_status_idx" ON "document_templates"("kind", "status");

-- CreateIndex
CREATE INDEX "document_templates_created_by_id_idx" ON "document_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "document_templates_deleted_at_idx" ON "document_templates"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_template_id_version_number_key" ON "document_template_versions"("template_id", "version_number");

-- CreateIndex
CREATE INDEX "document_template_versions_published_by_id_idx" ON "document_template_versions"("published_by_id");

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written index below. Prisma cannot express partial unique indexes and
-- `migrate diff` ignores them, so CI's drift gate stays green (same approach
-- as the live-invoice-per-encounter index). This is what makes "exactly one
-- default per kind" a database fact rather than a service promise: two
-- concurrent set-default transactions can both believe they cleared the old
-- default, and the second commit dies here instead of leaving two.
CREATE UNIQUE INDEX "document_templates_one_default_per_kind" ON "document_templates" ("kind") WHERE "is_default" AND "deleted_at" IS NULL;

-- Hand-written CHECK. A template whose name is blank is unselectable in every
-- picker that lists it by name.
ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_name_not_blank" CHECK (btrim("name") <> '');

-- Hand-written CHECK. Version numbers count publishes from one; zero or a
-- negative number would sort a "latest version" query wrongly and can only be
-- a bug writing the row.
ALTER TABLE "document_template_versions"
  ADD CONSTRAINT "document_template_versions_number_positive" CHECK ("version_number" >= 1);
