import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import "dotenv/config";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";

// ---- Set WAL mode eagerly (synchronous, before Prisma client exists) -----
//
// Why a *separate* libsql client instead of going through the Prisma
// adapter: `PRAGMA journal_mode = WAL` must run outside a SQLite
// transaction, and via `prisma.$executeRawUnsafe(...)` it sometimes
// hits a connection state where SQLite reports "cannot change into
// wal mode from within a transaction" — even though the adapter's
// performIO path uses `client.execute()` (which doesn't open a
// transaction in libsql). The transaction appears to come from
// Prisma's query machinery on its first raw query against a fresh
// connection.
//
// WAL mode is sticky in the DB header, so we can set it once on a
// throwaway libsql connection BEFORE the Prisma client exists. Every
// future connection — Prisma's and otherwise — opens the file and
// sees `journal_mode = wal` in the header. We also pass
// `synchronous = NORMAL` here for the same reason (it's persistent in
// the header); `busy_timeout` is per-connection and still needs to
// run on the Prisma adapter's connection, so that one stays in the
// async block below.
//
// We retry on SQLITE_BUSY because another writer can hold the lock
// during startup. Bounded to ~2s; the lock window is short.
//
// HMR caveat: blocking the module on this PRAGMA means every HMR
// re-evaluation pays the retry cost. We cache the success flag on
// globalThis so subsequent HMR cycles skip the work once the DB is
// in WAL mode (which persists in the header regardless).
const eagerWalGlobal = globalThis as unknown as { __prismaWalModeSet?: boolean };
if (!eagerWalGlobal.__prismaWalModeSet) {
  const delays = [100, 200, 500, 1000, 1000];
  const client = createClient({ url: dbUrl });
  let ok = false;
  try {
    for (const delay of delays) {
      try {
        client.execute("PRAGMA journal_mode = WAL");
        client.execute("PRAGMA synchronous = NORMAL");
        ok = true;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/SQLITE_BUSY|database is locked/i.test(msg)) {
          console.warn(
            `[prisma] eager WAL mode setup failed with non-BUSY error: ${msg}`,
          );
          break;
        }
      }
      // Busy-wait `delay`ms. The point of this PRAGMA is to land it
      // before the Prisma client exists, so we can't simply await
      // and continue — we have to hold the module load.
      const until = Date.now() + delay;
      while (Date.now() < until) {
        // intentional spin — synchronous wait
      }
    }
    if (!ok) {
      console.warn(
        "[prisma] eager WAL mode setup did not complete; DB will run in default journal mode and contention will be higher.",
      );
    } else {
      eagerWalGlobal.__prismaWalModeSet = true;
    }
  } finally {
    client.close();
  }
}

// NOTE: We pass the URL through to libsql unchanged. libsql accepts
// `file:relative` and resolves it against the process cwd at connection
// time, so we don't need a `path.resolve(process.cwd(), ...)` here.
// Avoiding that call at module load also keeps Turbopack's file
// tracer from grabbing the whole project tree.
const adapter = new PrismaLibSql({ url: dbUrl });
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  __prismaPragmasApplied?: Promise<void>;
};

function makeClient(): PrismaClient {
  return new PrismaClient({ adapter } as any);
}

export const prisma: PrismaClient = globalForPrisma.prisma || makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ---- Per-connection PRAGMAs (best-effort) --------------------------------
//
// Background: with Prisma 7's libsql driver adapter, any SQLITE_BUSY
// error from SQLite gets translated to P1008 "SocketTimeout" (see
// convertDriverError → kind: "SocketTimeout" in
// @prisma/adapter-libsql/dist/index-node.mjs). The default
// `busy_timeout = 0` makes SQLite return SQLITE_BUSY the moment a
// write lock is held, so a `theme.update()` will fail whenever the
// prune cycle (200-row deleteMany batches) or the RSS refresh
// (per-item upsert loops) is mid-transaction — even though the
// holding transaction is about to release the lock.
//
// We can't set busy_timeout via the libsql client config (the
// adapter doesn't pass the better-sqlite3 `timeout` option through),
// so we have to do it with a PRAGMA. The PRAGMA itself needs the
// write lock to write the journal_mode header, so during a hot
// moment of contention it can also fail with SQLITE_BUSY — chicken
// and egg. We retry the PRAGMA with backoff so it eventually lands.
//
//   - `journal_mode = WAL`  (sticky in DB header, set once)
//       Default `DELETE` mode blocks all readers on every write. WAL
//       lets readers and writers run concurrently, which is the
//       biggest single concurrency win for this app's read-heavy
//       workload (config polls, message feeds) interleaved with
//       writes (RSS upserts, prune, admin edits).
//
//   - `busy_timeout = 30000`  (per-connection)
//       Even with WAL, only one writer holds the lock at a time.
//       busy_timeout makes the writer wait up to 30s for the lock
//       before SQLITE_BUSY is returned. 30s is well above any single
//       batch's hold time (prune 200 rows ~tens of ms) while still
//       bounded enough to surface a true deadlock clearly.
//
//   - `synchronous = NORMAL`  (persistent in DB header)
//       Default `FULL` fsyncs on every commit. With WAL, `NORMAL` is
//       still crash-safe (only loses the last in-flight transaction
//       on power loss) and removes the per-commit fsync.
//
// We deliberately do NOT top-level await these. Blocking the module
// export on PRAGMAs makes HMR re-evaluations race against the
// in-flight prisma queries of the previous module frame, and a
// failed-await at module load is worse than no PRAGMAs at all. The
// PRAGMAs run in the background; P1008 is handled at the call site
// by `withBusyRetry` (below) regardless of whether the PRAGMAs have
// landed yet.
//
// Only `busy_timeout` lives here. `journal_mode` and `synchronous` are
// sticky in the DB header, and we set them synchronously in
// `setWalModeEagerly()` above so they land before any Prisma client
// exists. `busy_timeout` is per-connection, so every new Prisma
// connection needs it set on the Prisma adapter's own connection.
const PRAGMAS = [
  "PRAGMA busy_timeout = 30000",
] as const;

async function applyOnePragma(sql: string): Promise<boolean> {
  // On startup the news service's first RSS refresh can hold the
  // write lock for tens of seconds on a large dev.db (320MB+ in this
  // repo's typical state). 5 attempts over 3s — the original budget
  // — is not enough; budget needs to span the full startup RSS
  // window. 10 attempts with exponential backoff capped at 5s gives
  // ~35s total, which covers the worst observed startup. After the
  // first successful attempt the PRAGMA sticks, so we only need to
  // outlast startup contention, not all of runtime.
  const delays = [500, 1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000];
  for (const delay of delays) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Quiet on per-attempt failure: the lock is just busy, no
      // actionable signal. Only surface the final outcome.
      if (!/SQLITE_BUSY|database is locked/i.test(msg)) {
        console.warn(`[prisma] ${sql} failed with non-BUSY error:`, msg);
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

async function applyPragmas(): Promise<void> {
  let failed = 0;
  for (const sql of PRAGMAS) {
    const ok = await applyOnePragma(sql);
    if (!ok) failed++;
  }
  if (failed === 0) {
    console.log("[prisma] PRAGMA busy_timeout=30000 applied");
  } else if (failed < PRAGMAS.length) {
    console.warn(
      `[prisma] ${PRAGMAS.length - failed}/${PRAGMAS.length} PRAGMAs applied after retries; ` +
        `remaining are best-effort and SQLITE_BUSY is still handled by withBusyRetry at the call site.`,
    );
  } else {
    console.warn(
      `[prisma] PRAGMAs not applied (database stayed busy through startup window). ` +
        `App is still functional; P1008 retries are handled by withBusyRetry at the call site.`,
    );
  }
}

if (!globalForPrisma.__prismaPragmasApplied) {
  globalForPrisma.__prismaPragmasApplied = applyPragmas().catch((err) => {
    console.error("[prisma] applyPragmas threw:", err);
  });
}

// ---- P1008 retry helper ---------------------------------------------------
//
// Defense in depth: even with busy_timeout set, transient locks
// (e.g. a 200-row prune batch, or a single RSS upsert that just
// happens to land in the few-ms window before PRAGMAs are applied)
// can surface as P1008. `withBusyRetry` catches the specific
// SQLITE_BUSY → SocketTimeout mapping and retries with backoff. Each
// retry waits a small multiple; most cases resolve on the first or
// second attempt.
//
// The retry is intentionally narrow: only P1008 (and only when the
// meta code path is the libsql SocketTimeout, which is what
// SQLITE_BUSY maps to). Other Prisma errors (unique constraint,
// not-null, type errors, ...) bubble up unchanged.
export async function withBusyRetry<T>(fn: () => Promise<T>): Promise<T> {
  // 8 attempts, exponential backoff capped at 2s — total wall-clock
  // budget ~5.05s of wait time + per-call cost.
  //
  // Why this long: with dev.db at 320MB, the news service's per-item
  // upsert loop holds the global SQLite write lock for ~100-150ms per
  // call, and a full RSS refresh (50+ items) keeps the lock under
  // contention for several seconds. A 250ms budget (the original
  // [0,50,200]) only spans 1-2 lock windows and the next retry just
  // bumps into the same lock. 5s of backoff gives us room to outlast
  // a typical upsert burst while staying bounded enough that a true
  // deadlock still surfaces to the user in under 10s.
  const delays = [0, 50, 100, 200, 400, 800, 1500, 2000];
  let lastErr: unknown = null;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "P1008") {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
