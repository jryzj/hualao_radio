// Emergency helper: when `prisma migrate deploy` can't run (e.g.
// the project has FTS5 drift that confuses the migration engine),
// run this script directly against the production database to
// backfill the three columns that the recent session changed.
//
// This script intentionally does NOT update Prisma's
// `_prisma_migrations` table — that's `prisma migrate deploy`'s
// job. After running this on prod, the operator should also
// `prisma migrate deploy` (or `prisma migrate resolve`) so Prisma's
// bookkeeping catches up. Otherwise the next deploy will try to
// re-apply these and fail (RENAME on a renamed column,
// ADD COLUMN on an existing column).
//
// Safety: each statement is wrapped in a try/catch that recognizes
// "already done" errors, so re-running on a partly-applied DB is
// safe.

const { createClient } = require('@libsql/client');

(async () => {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  const client = createClient({ url });
  const log = [];

  try {
    // 1) Persona.prompt -> Persona.personality (idempotent)
    try {
      await client.execute('ALTER TABLE "Persona" RENAME COLUMN "prompt" TO "personality"');
      log.push('OK: renamed Persona.prompt -> personality');
    } catch (e) {
      if (/no such column/i.test(e.message) || /no column named/i.test(e.message)) {
        log.push('SKIP: Persona already renamed (no "prompt" column)');
      } else {
        throw e;
      }
    }

    // 2) NewsConfig.newsPoolSize
    try {
      await client.execute('ALTER TABLE "NewsConfig" ADD COLUMN "newsPoolSize" INTEGER NOT NULL DEFAULT 100');
      log.push('OK: added NewsConfig.newsPoolSize');
    } catch (e) {
      if (/duplicate column/i.test(e.message) || /already exists/i.test(e.message)) {
        log.push('SKIP: NewsConfig.newsPoolSize already exists');
      } else {
        throw e;
      }
    }

    // 3) NewsConfig.newsBufferSize
    try {
      await client.execute('ALTER TABLE "NewsConfig" ADD COLUMN "newsBufferSize" INTEGER NOT NULL DEFAULT 100');
      log.push('OK: added NewsConfig.newsBufferSize');
    } catch (e) {
      if (/duplicate column/i.test(e.message) || /already exists/i.test(e.message)) {
        log.push('SKIP: NewsConfig.newsBufferSize already exists');
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    console.log(log.join('\n'));
    client.close();
  }
})();
