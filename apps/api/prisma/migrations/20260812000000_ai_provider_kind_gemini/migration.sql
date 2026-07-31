-- AlterEnum
-- Additive only: no existing row can hold the new value, so this is backward
-- compatible with the previous API release. Positioned AFTER 'ANTHROPIC' so
-- the database ordering matches the Prisma schema and no drift is reported.
ALTER TYPE "AiProviderKind" ADD VALUE 'GEMINI' AFTER 'ANTHROPIC';
