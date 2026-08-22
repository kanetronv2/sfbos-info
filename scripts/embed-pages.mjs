import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.EMBEDDING_API_URL || !process.env.EMBEDDING_MODEL) {
  throw new Error("EMBEDDING_API_URL and EMBEDDING_MODEL are required");
}
const sql = neon(process.env.DATABASE_URL);
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 1000;
const model = process.env.EMBEDDING_MODEL;
const pages = await sql.query(
  `SELECT d.id::text AS document_id, p.page_number, left(p.content, 12000) AS content
   FROM pages p JOIN documents d ON d.id = p.document_id
   LEFT JOIN semantic_embeddings e
     ON e.entity_type = 'page' AND e.entity_key = d.id::text || ':' || p.page_number::text AND e.model = $1
   WHERE e.entity_key IS NULL
   ORDER BY d.meeting_date DESC, p.page_number LIMIT $2`,
  [model, limit],
);
for (let offset = 0; offset < pages.length; offset += 32) {
  const batch = pages.slice(offset, offset + 32);
  const headers = { "Content-Type": "application/json" };
  if (process.env.EMBEDDING_API_TOKEN) headers.Authorization = `Bearer ${process.env.EMBEDDING_API_TOKEN}`;
  const response = await fetch(process.env.EMBEDDING_API_URL, {
    method: "POST", headers,
    body: JSON.stringify({ model, input: batch.map((page) => page.content) }),
  });
  if (!response.ok) throw new Error(`Embedding provider returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const vectors = body.embeddings ?? body.data?.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
  if (!Array.isArray(vectors) || vectors.length !== batch.length) throw new Error("Unexpected embedding response shape");
  for (let index = 0; index < batch.length; index += 1) {
    const page = batch[index];
    const embedding = vectors[index];
    await sql.query(
      `INSERT INTO semantic_embeddings (entity_type, entity_key, model, dimensions, embedding, content_sha256)
       VALUES ('page',$1,$2,$3,$4::double precision[],$5)
       ON CONFLICT (entity_type, entity_key, model) DO UPDATE SET
         dimensions = excluded.dimensions, embedding = excluded.embedding,
         content_sha256 = excluded.content_sha256, updated_at = now()`,
      [`${page.document_id}:${page.page_number}`, model, embedding.length, embedding, createHash("sha256").update(page.content).digest("hex")],
    );
  }
  console.log(`Embedded ${Math.min(offset + batch.length, pages.length)}/${pages.length} pages.`);
}
