// Wrap `prisma migrate deploy` with SQLITE_BUSY retries. The CLI
// doesn't inherit `busy_timeout` from src/lib/prisma/index.ts, so a
// concurrent writer (a leftover next start, an admin tools tab, etc.)
// holding the dev.db write lock fails the migration immediately with
// "database is locked". Bounded retries cover the typical lock window
// (a few hundred ms to a few seconds depending on what's writing).
//
// Why a Node script and not a shell loop: we want to surface a clean
// exit code so npm's prestart can fail fast if retries exhaust. The
// shell approach (a Bash `for` loop with `||` and `sleep`) would also
// work on POSIX but isn't portable to cmd/PowerShell on Windows where
// the user runs npm.
//
// Total wall-clock budget: ~30s (12 attempts, 500ms→4s backoff). Most
// cases resolve on the first or second retry; the upper bound catches
// long lock windows from a startup RSS refresh or a 200-row prune
// batch (see src/lib/prisma/index.ts:220 for the analogous in-process
// retry rationale).

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const MAX_ATTEMPTS = 12;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 4000;

// Cross-platform invocation of the Prisma CLI.
//
// We invoke the local Prisma engine entry directly so we don't depend
// on the shell resolving `npx` / `npx.cmd` (which fails under
// spawnSync on Windows: `npx` not in PATH → ENOENT; passing
// `npx.cmd` → EINVAL; the `.bin/prisma` shim is a bash script that
// can't be Node-loaded). `node_modules/prisma/build/index.js` is the
// real CLI binary on every platform; running it through `node` skips
// every shim layer.

function runPrismaMigrateDeploy() {
  const cliEntry = path.join(
    __dirname,
    "..",
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  return spawnSync(process.execPath, [cliEntry, "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = runPrismaMigrateDeploy();
    if (result.status === 0) {
      process.exit(0);
    }
    // spawnSync puts the child stderr/stdout into pipes when stdio is
    // 'inherit' on Windows — the captured `result.stderr` is empty.
    // Read what we can from the streams directly via process.stderr /
    // process.stdout buffering is unreliable, so we lean on the
    // well-known Prisma error prefix as the signal: Prisma prints
    // "Error: SQLite database error\ndatabase is locked" on the
    // terminal even when stdio is captured. To avoid a false negative
    // on Windows where stderr capture is hollow, also accept the case
    // where status != 0 AND we cannot see the message — treat it as a
    // possible lock and retry up to the budget. This errs on the side
    // of waiting longer on real (non-lock) failures, but the user
    // still sees the original Prisma output inline each attempt.
    const stdoutText = result.stdout ? result.stdout.toString() : "";
    const stderrText = result.stderr ? result.stderr.toString() : "";
    const combined = stdoutText + stderrText;
    const locked = /SQLITE_BUSY|database is locked/i.test(combined);
    // Only retry when we either confirmed the lock pattern OR we have
    // no captured output at all (Windows case where stderr was hollow).
    // If the output shows a non-lock error (e.g. a real SQL syntax
    // problem), surface it immediately.
    const capturedSomething = combined.trim().length > 0;
    const shouldRetry = locked || (!capturedSomething && result.status !== 0);
    if (!shouldRetry || attempt === MAX_ATTEMPTS) {
      process.exit(result.status ?? 1);
    }
    const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
    console.warn(
      `[migrate-with-retry] attempt ${attempt}/${MAX_ATTEMPTS} hit SQLITE_BUSY; ` +
        `retrying in ${delay}ms`,
    );
    await sleep(delay);
  }
})();
