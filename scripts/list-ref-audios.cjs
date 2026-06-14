// List all workflows and their refAudioPath to compare with on-disk files.
const { createClient } = require('@libsql/client');
(async () => {
  const client = createClient({ url: 'file:dev.db' });
  try {
    const r = await client.execute('SELECT id, name, refAudioPath FROM Workflow ORDER BY createdAt DESC LIMIT 10');
    console.log('DB rows:');
    for (const row of r.rows) {
      console.log(`  ${row.id}  ${row.name}  refAudioPath=${row.refAudioPath ?? 'null'}`);
    }
  } finally {
    client.close();
  }
})();
