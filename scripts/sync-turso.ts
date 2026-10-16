import { createClient } from "@libsql/client";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Read .env manually to ensure variables are available
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env");
  process.exit(1);
}

const turso = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

async function main() {
  console.log("🚀 Connecting to Turso:", tursoUrl);

  // 1. Generate SQL statements from Prisma schema
  console.log("📐 Generating schema SQL from Prisma...");
  const sqlDump = execSync(
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    { encoding: "utf-8" }
  );

  // 2. Execute statements on Turso
  console.log("⚡ Creating tables and indexes on Turso...");
  const cleanSql = sqlDump.replace(/--.*$/gm, "");
  const statements = cleanSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await turso.execute(stmt);
    } catch (e: any) {
      console.warn("Statement failed:", stmt.slice(0, 60), "->", e.message);
    }
  }
  console.log("✅ Turso schema sync completed.");

  // 3. Migrate existing data from dev.db if present
  const localDbPath = path.join(process.cwd(), "prisma", "dev.db");
  if (fs.existsSync(localDbPath)) {
    console.log("📦 Copying existing local data from dev.db to Turso...");
    const local = createClient({ url: `file:${localDbPath}` });

    const tables = ["users", "tiles", "room_scenes", "login_posters", "saved_designs", "payments", "notifications"];
    for (const table of tables) {
      try {
        const localRows = await local.execute(`SELECT * FROM "${table}"`);
        if (localRows.rows.length === 0) continue;

        console.log(`   Migrating ${localRows.rows.length} rows for table "${table}"...`);
        for (const row of localRows.rows) {
          const keys = Object.keys(row);
          const placeholders = keys.map(() => "?").join(", ");
          const colNames = keys.map((k) => `"${k}"`).join(", ");
          const values = keys.map((k) => row[k]);

          await turso.execute({
            sql: `INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`,
            args: values as any,
          });
        }
      } catch (err: any) {
        console.warn(`   Skipping table "${table}":`, err.message);
      }
    }
    console.log("✅ Local data migration finished.");
  }

  // 4. Verify count on Turso
  const userCheck = await turso.execute('SELECT COUNT(*) as c FROM "users"');
  const tileCheck = await turso.execute('SELECT COUNT(*) as c FROM "tiles"');
  console.log(`🎉 Done! Turso now has: ${userCheck.rows[0].c} users and ${tileCheck.rows[0].c} tiles.`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
