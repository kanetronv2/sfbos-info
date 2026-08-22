import { neon } from "@neondatabase/serverless";
import type { SearchResult } from "./types";

export async function rerankWithEmbeddings(query: string, results: SearchResult[], limit: number) {
  const endpoint = process.env.EMBEDDING_API_URL;
  const model = process.env.EMBEDDING_MODEL;
  if (!endpoint || !model || !process.env.DATABASE_URL) {
    return { results: results.slice(0, limit), model: null, coverage: 0, fallbackReason: "Embedding provider is not configured" };
  }
  try {
    const [queryEmbedding] = await requestEmbeddings([query]);
    if (!queryEmbedding) throw new Error("Provider returned no query embedding");
    const sql = neon(process.env.DATABASE_URL);
    const keys = results.map((result) => result.id.replace("-", ":"));
    const rows = await sql.query(
      `SELECT entity_key, embedding FROM semantic_embeddings
       WHERE entity_type = 'page' AND model = $1 AND entity_key = ANY($2::text[])`,
      [model, keys],
    );
    const vectors = new Map(rows.map((row) => [row.entity_key, row.embedding as number[]]));
    if (!vectors.size) return { results: results.slice(0, limit), model, coverage: 0, fallbackReason: "No current candidate embeddings were available" };
    const maxLexical = Math.max(...results.map((result) => result.score), 0.000001);
    const reranked = results.map((result) => {
      const vector = vectors.get(result.id.replace("-", ":"));
      const semantic = vector ? (cosine(queryEmbedding, vector) + 1) / 2 : 0;
      const lexical = result.score / maxLexical;
      return { ...result, lexicalScore: result.score, semanticScore: vector ? semantic : null, score: 0.65 * lexical + 0.35 * semantic };
    }).sort((a, b) => b.score - a.score || b.lexicalScore - a.lexicalScore);
    return { results: reranked.slice(0, limit), model, coverage: vectors.size / Math.max(1, results.length), fallbackReason: null };
  } catch (error) {
    return { results: results.slice(0, limit), model, coverage: 0, fallbackReason: error instanceof Error ? error.message : "Embedding request failed" };
  }
}

export async function requestEmbeddings(input: string[]): Promise<number[][]> {
  const endpoint = process.env.EMBEDDING_API_URL;
  const model = process.env.EMBEDDING_MODEL;
  if (!endpoint || !model) throw new Error("EMBEDDING_API_URL and EMBEDDING_MODEL are required");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.EMBEDDING_API_TOKEN) headers.Authorization = `Bearer ${process.env.EMBEDDING_API_TOKEN}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Embedding provider returned ${response.status}`);
  const body = await response.json() as { data?: Array<{ index?: number; embedding: number[] }>; embeddings?: number[][] };
  if (body.embeddings) return body.embeddings;
  return (body.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
}

function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] ** 2;
    bMagnitude += b[index] ** 2;
  }
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude) || 1);
}
