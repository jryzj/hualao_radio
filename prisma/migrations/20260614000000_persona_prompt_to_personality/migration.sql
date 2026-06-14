-- Rename Persona.prompt -> Persona.personality.
-- SQLite RENAME COLUMN preserves data; the 8 existing rows keep their
-- values. We renamed this in code (Persona.prompt -> Persona.personality
-- to avoid confusion with the LLM "prompt" concept) but the migration
-- was missed at the time, so the dev DB was patched with a one-shot
-- script and the prod DB never got the change.
ALTER TABLE "Persona" RENAME COLUMN "prompt" TO "personality";
