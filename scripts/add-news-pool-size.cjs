// One-shot dev helper: add the newsPoolSize column to NewsConfig.
// Not a migration file — the project's Prisma migration history is
// out of sync (FTS5 tables live outside the migration directory),
// so we apply this column directly to the dev DB.
const { createClient } = require('@libsql/client');
(async () => {
  const client = createClient({ url: 'file:dev.db' });
  try {
    await client.execute('ALTER TABLE NewsConfig ADD COLUMN newsPoolSize INTEGER NOT NULL DEFAULT 100');
    console.log('OK: newsPoolSize column added');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    client.close();
  }
})();
