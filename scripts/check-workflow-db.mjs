import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./dev.db" });
const r = await c.execute("SELECT id, name, refAudioPath FROM Workflow");
console.log(JSON.stringify(r.rows, null, 2));
