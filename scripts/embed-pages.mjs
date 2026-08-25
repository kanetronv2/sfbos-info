import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.EMBEDDING_API_URL || !process.env.EMBEDDING_MODEL) {
  throw new Error("EMBEDDING_API_URL and EMBEDDING_MODEL are required");
}
const sql = neon(process.env.DATABASE_URL);
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 1000;
const entityArg = process.argv.find((value) => value.startsWith("--entity="));
const entity = entityArg ? entityArg.split("=")[1] : "all";
if (!["all", "page", "legislative-item", "comment"].includes(entity)) {
  throw new Error("--entity must be all, page, legislative-item, or comment");
}
const model = process.env.EMBEDDING_MODEL;
const records = await sql.query(
  `WITH corpus AS (
     SELECT 'legislative-item'::text AS entity_type, i.id::text AS entity_key,
            d.meeting_date, left(i.title || E'\n' || i.content, 12000) AS content
     FROM legislative_items i JOIN documents d ON d.id = i.document_id
     UNION ALL
     SELECT 'comment', c.id::text, d.meeting_date,
            left(c.speaker || E'\n' || c.content, 12000)
     FROM public_comments c JOIN documents d ON d.id = c.document_id
     UNION ALL
     SELECT 'page', d.id::text || ':' || p.page_number::text, d.meeting_date,
            left(p.content, 12000)
     FROM pages p JOIN documents d ON d.id = p.document_id
   )
   SELECT corpus.entity_type, corpus.entity_key, corpus.content
   FROM corpus
   LEFT JOIN semantic_embeddings e
     ON e.entity_type = corpus.entity_type AND e.entity_key = corpus.entity_key AND e.model = $1
   WHERE e.entity_key IS NULL AND ($2 = 'all' OR corpus.entity_type = $2)
   ORDER BY corpus.meeting_date DESC, corpus.entity_type, corpus.entity_key
   LIMIT $3`,
  [model, entity, limit],
);
for (let offset = 0; offset < records.length; offset += 32) {
  const batch = records.slice(offset, offset + 32);
  const headers = { "Content-Type": "application/json" };
  if (process.env.EMBEDDING_API_TOKEN) headers.Authorization = `Bearer ${process.env.EMBEDDING_API_TOKEN}`;
  const response = await fetch(process.env.EMBEDDING_API_URL, {
    method: "POST", headers,
    body: JSON.stringify({ model, input: batch.map((record) => record.content) }),
  });
  if (!response.ok) throw new Error(`Embedding provider returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const vectors = body.embeddings ?? body.data?.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
  if (!Array.isArray(vectors) || vectors.length !== batch.length) throw new Error("Unexpected embedding response shape");
  for (let index = 0; index < batch.length; index += 1) {
    const record = batch[index];
    const embedding = vectors[index];
    await sql.query(
      `INSERT INTO semantic_embeddings (entity_type, entity_key, model, dimensions, embedding, content_sha256)
       VALUES ($1,$2,$3,$4,$5::double precision[],$6)
       ON CONFLICT (entity_type, entity_key, model) DO UPDATE SET
         dimensions = excluded.dimensions, embedding = excluded.embedding,
         content_sha256 = excluded.content_sha256, updated_at = now()`,
      [record.entity_type, record.entity_key, model, embedding.length, embedding, createHash("sha256").update(record.content).digest("hex")],
    );
  }
  console.log(`Embedded ${Math.min(offset + batch.length, records.length)}/${records.length} records.`);
}
