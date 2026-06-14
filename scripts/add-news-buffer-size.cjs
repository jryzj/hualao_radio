// One-shot dev helper: add the newsBufferSize column to NewsConfig.
// The project's Prisma migration history is out of sync (FTS5 tables
// live outside the migration directory), so we apply this column
// directly to the dev DB. Keeps the existing NewsConfig row's
// default at 100.
const { createClient } = require('@libsql/client');
(async () => {
  const client = createClient({ url: 'file:dev.db' });
  try {
    await client.execute('ALTER TABLE NewsConfig ADD COLUMN newsBufferSize INTEGER NOT NULL DEFAULT 100');
    console.log('OK: newsBufferSize column added');
    const r = await client.execute('SELECT newsBufferSize FROM NewsConfig LIMIT 5');
    console.log('sample:', JSON.stringify(r.rows));
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    client.close();
  }
})();
