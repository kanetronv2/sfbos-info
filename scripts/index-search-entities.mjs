import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;
const parserVersion = "search-entities-1.0.0";

await sql.query(
  `DELETE FROM search_entities
   WHERE entity_type = 'file-number' AND parser_version = $1`,
  [parserVersion],
);

const items = await sql.query(
  `SELECT i.id::text, i.file_number, i.title, i.content
   FROM legislative_items i
   WHERE i.search_entities_parser_version IS DISTINCT FROM $1
   ORDER BY i.id LIMIT $2`,
  [parserVersion, limit],
);

const records = items.flatMap((item) => extractEntities(item).map((entity) => ({
  legislative_item_id: item.id,
  entity_type: entity.type,
  normalized_value: normalize(entity.display),
  display_value: entity.display,
  numeric_value: entity.numeric ?? null,
  confidence: entity.confidence,
  parser_version: parserVersion,
})));

for (let offset = 0; offset < records.length; offset += 1000) {
  const batch = records.slice(offset, offset + 1000);
  await sql.query(
    `INSERT INTO search_entities (
       legislative_item_id, entity_type, normalized_value, display_value,
       numeric_value, confidence, parser_version
     )
     SELECT legislative_item_id::bigint, entity_type, normalized_value, display_value,
            numeric_value, confidence, parser_version
     FROM jsonb_to_recordset($1::jsonb) AS record(
       legislative_item_id text, entity_type text, normalized_value text, display_value text,
       numeric_value numeric, confidence numeric, parser_version text
     )
     ON CONFLICT (legislative_item_id, entity_type, normalized_value) DO UPDATE SET
       display_value = excluded.display_value,
       numeric_value = excluded.numeric_value,
       confidence = excluded.confidence,
       parser_version = excluded.parser_version,
       updated_at = now()`,
    [JSON.stringify(batch)],
  );
  console.log(`Indexed ${Math.min(offset + batch.length, records.length)}/${records.length} entity records.`);
}
console.log(`Indexed ${items.length} legislative items and ${records.length} entities with ${parserVersion}.`);

for (let offset = 0; offset < items.length; offset += 5000) {
  await sql.query(
    `UPDATE legislative_items
     SET search_entities_indexed_at = now(), search_entities_parser_version = $1
     WHERE id = ANY($2::bigint[])`,
    [parserVersion, items.slice(offset, offset + 5000).map((item) => item.id)],
  );
}

function extractEntities(item) {
  const text = `${item.title}\n${item.content}`;
  const entities = [];
  const addresses = text.match(/\b\d{1,5}(?:-\d{1,5})?\s+(?:(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?)\s+)?(?:[\p{L}\p{N}'&.-]+\s+){0,6}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Way|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Highway|Hwy\.?)\b/giu) ?? [];
  for (const address of addresses) entities.push({ type: "address", display: address.replace(/[.,;:]+$/, ""), confidence: 0.9 });
  for (const match of text.matchAll(/\b([\d,]+)\s+(?:new\s+|net\s+|affordable\s+|residential\s+|dwelling\s+|housing\s+)*(?:housing\s+|residential\s+|dwelling\s+)?units?\b/gi)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (value > 0) entities.push({ type: "housing-units", display: `${value} housing units`, numeric: value, confidence: 0.86 });
  }
  for (const match of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|b|m|k)?/gi)) {
    const multiplier = { billion: 1e9, b: 1e9, million: 1e6, m: 1e6, thousand: 1e3, k: 1e3 }[match[2]?.toLowerCase()] ?? 1;
    entities.push({ type: "amount", display: match[0].replace(/\s+/g, " "), numeric: Number(match[1].replace(/,/g, "")) * multiplier, confidence: 0.95 });
  }
  if (/\b(?:agreement|contract|grant|lease)\b/i.test(item.title)) {
    const party = item.title.split(/\s+-\s+/).slice(1).find((part) => !/^\$|^(?:amendment|term|services?|funding|increase|decrease)\b/i.test(part));
    if (party) entities.push({ type: "party", display: party.trim(), confidence: 0.78 });
  }
  return [...new Map(entities.map((entity) => [`${entity.type}:${normalize(entity.display)}`, entity])).values()].slice(0, 80);
}

function normalize(value) {
  return value.toLowerCase().replace(/\./g, "").replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd").replace(/\s+/g, " ").trim();
}
