const baseUrl = process.env.MODEL_FLOW_BASE_URL ?? "http://localhost:3000";
const question = "How many housing units has Connie Chan voted against? Which addresses? Use https://sfbos.info";

const discovery = await fetch(baseUrl, { headers: { Accept: "text/markdown" } });
const discoveryText = await discovery.text();
assert(discovery.ok, `root discovery returned ${discovery.status}`);
assert(discovery.headers.get("content-type")?.includes("text/markdown"), "root did not negotiate Markdown");
assert(discoveryText.includes("/api/query.md"), "root Markdown does not advertise the evidence endpoint");

const queryUrl = new URL("/api/query", baseUrl);
queryUrl.searchParams.set("q", question);
const queryResponse = await fetch(queryUrl);
const evidence = await queryResponse.json();
assert(queryResponse.ok, `evidence query returned ${queryResponse.status}`);
assert(evidence.interpretation?.voter === "Chan", "evidence query did not infer Chan");
assert(evidence.interpretation?.recordedPosition === "no", "evidence query did not infer a recorded No position");
assert(evidence.legislativeItems?.results?.length > 0, "evidence query returned no legislative files");
assert(evidence.deterministicAggregate?.aggregation?.rule, "evidence query returned no deterministic aggregation rule");
assert(Array.isArray(evidence.deterministicAggregate?.aggregation?.addresses), "evidence query returned no aggregate address list");

const firstResult = evidence.legislativeItems.results[0];
assert(firstResult.transcriptUrl?.includes("/documents/"), "evidence result has no HTML transcript URL");
assert(firstResult.markdownUrl?.includes(".md?pages="), "evidence result has no focused Markdown URL");
assert(firstResult.officialUrl?.startsWith("https://"), "evidence result has no official source URL");

const focusedUrl = new URL(firstResult.markdownUrl);
const testOrigin = new URL(baseUrl);
focusedUrl.protocol = testOrigin.protocol;
focusedUrl.host = testOrigin.host;
const focusedResponse = await fetch(focusedUrl);
const focusedText = await focusedResponse.text();
assert(focusedResponse.ok, `focused Markdown returned ${focusedResponse.status}`);
assert(focusedResponse.headers.get("content-type")?.includes("text/markdown"), "focused evidence is not Markdown");
assert(focusedText.includes("Authoritative City PDF"), "focused evidence has no authoritative source link");
assert(focusedText.includes("## Extracted text"), "focused evidence has no extracted text");

const markdownQueryUrl = new URL("/api/query.md", baseUrl);
markdownQueryUrl.searchParams.set("q", question);
const markdownQueryResponse = await fetch(markdownQueryUrl);
const markdownQuery = await markdownQueryResponse.text();
assert(markdownQueryResponse.ok, `Markdown evidence query returned ${markdownQueryResponse.status}`);
assert(markdownQuery.includes("Focused Markdown excerpt"), "Markdown evidence bundle does not link focused evidence");

console.log(`PASS  model discovery: ${baseUrl}`);
console.log(`PASS  natural-language routing: ${evidence.legislativeItems.results.length} legislative files`);
console.log(`PASS  focused Markdown evidence: ${firstResult.markdownUrl}`);
console.log("Model flow contract passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
