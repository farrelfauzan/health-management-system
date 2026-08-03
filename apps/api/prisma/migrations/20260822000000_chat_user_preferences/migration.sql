-- P15-T14: typed cross-session chat preferences (ai-chatbot-tools.md §6.2).
--
-- **Three typed columns, and that is the whole design.** A free-text store of
-- model-written facts about users is the wrong implementation of "remember
-- me": under UU PDP it is personal data with no stated purpose, no retention
-- limit and no subject visibility, and if a doctor discussed a patient it
-- would become a shadow EMR outside the retention regime governing the real
-- one. Columns defined in a migration cannot become that, whatever a model
-- proposes.
--
-- Every column is nullable: "no preference" is the default and is a distinct
-- state from any particular preference. The row cascades with its subject, so
-- deleting a user takes their preferences with them.
CREATE TYPE "ChatPreferredLanguage" AS ENUM ('ID', 'EN');

CREATE TYPE "ChatResponseLength" AS ENUM ('SHORT', 'STANDARD', 'DETAILED');

CREATE TABLE "chat_user_preferences" (
    "user_id" UUID NOT NULL,
    "preferred_language" "ChatPreferredLanguage",
    "response_length" "ChatResponseLength",
    "default_specialty_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- The subject owns the row: erasing the user erases it.
ALTER TABLE "chat_user_preferences" ADD CONSTRAINT "chat_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A retired specialty clears the preference rather than blocking its
-- deletion: a stale poli reference is worse than no preference at all.
ALTER TABLE "chat_user_preferences" ADD CONSTRAINT "chat_user_preferences_default_specialty_id_fkey" FOREIGN KEY ("default_specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
