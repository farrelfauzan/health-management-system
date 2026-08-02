-- P15-T09: pgvector extension, ahead of any retrieval schema.
--
-- Infrastructure lands first and alone: docker-compose.dev.yml and CI move
-- from postgres:16-alpine to pgvector/pgvector:pg16 in the same PR, because
-- this statement fails on a server without the extension available — a
-- migration written before the images changed would pass on a developer's
-- pgvector container and break for everyone else (ai-chatbot-tools.md §5.4).
--
-- No table uses the vector type yet. The document/chunk schema (P15-T10)
-- builds on this; keeping the extension separate means an environment
-- surprise shows up here, in a one-line migration, not tangled into a schema
-- change.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";
