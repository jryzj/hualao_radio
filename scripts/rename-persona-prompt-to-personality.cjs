// One-shot dev helper: rename Persona.prompt → Persona.personality.
// Keeps all 8 existing rows intact (SQLite RENAME COLUMN preserves data).
//
// The project's Prisma migration history is out of sync (FTS5 tables
// live outside the migration directory), so we apply this rename
// directly to the dev DB.
const { createClient } = require('@libsql/client');
(async () => {
  const client = createClient({ url: 'file:dev.db' });
  try {
    await client.execute('ALTER TABLE Persona RENAME COLUMN prompt TO personality');
    console.log('OK: renamed prompt → personality');
    const sample = await client.execute('SELECT name, personality FROM Persona LIMIT 3');
    console.log('sample after rename:', JSON.stringify(sample.rows, null, 2));
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    client.close();
  }
})();
