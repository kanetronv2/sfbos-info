import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(join(scriptDirectory, "..", "db", "schema.sql"), "utf8");
const sql = neon(process.env.DATABASE_URL);

const statements = schema
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Database schema is up to date.");
