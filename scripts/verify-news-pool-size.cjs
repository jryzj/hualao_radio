// Verify the new column is in NewsConfig.
const { createClient } = require('@libsql/client');
(async () => {
  const client = createClient({ url: 'file:dev.db' });
  try {
    const r = await client.execute("SELECT id, newsPoolSize FROM NewsConfig LIMIT 5");
    console.log('rows:', JSON.stringify(r.rows));
  } finally {
    client.close();
  }
})();
