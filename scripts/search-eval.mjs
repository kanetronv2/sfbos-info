const baseUrl = process.env.SEARCH_EVAL_BASE_URL ?? "http://localhost:3000";
const cases = [
  { query: "469 Stevenson", expect: (body) => body.results[0]?.fileNumber === "210920" },
  { query: "William Plamer", expect: (body) => body.results[0]?.fileNumber === "230639" },
  { query: "711 Post St Urban Alchemy contract", expect: (body) => ["211306", "240201"].includes(body.results[0]?.fileNumber) },
  { query: "How many housing units has Connie Chan voted against?", expect: (body) => body.filters.supervisor === "Chan" && body.filters.position === "no" && body.results.every((result) => result.resultType !== "comments") },
  { query: "230639", expect: (body) => body.results[0]?.fileNumber === "230639" },
  { query: "Who voted to authorize police killer robots in 2022?", expect: (body) => body.results.some((result) => result.fileNumber === "220641") },
  { query: "rent control", expect: (body) => body.results.some((result) => result.fileNumber === "240880") },
  { query: "Gaza ceasefire", expect: (body) => body.results.some((result) => result.fileNumber === "231263") },
  { query: "make JFK Drive car-free", expect: (body) => body.results.some((result) => result.fileNumber === "220261") },
  { query: "police overtime 2023", expect: (body) => body.filters.fromYear === 2023 && body.filters.toYear === 2023 && body.results.some((result) => result.fileNumber === "230158") },
];

let failures = 0;
for (const testCase of cases) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(testCase.query)}&mode=lexical&limit=10`);
  const body = await response.json();
  const passed = response.ok && testCase.expect(body);
  const duration = Math.round(performance.now() - started);
  console.log(`${passed ? "PASS" : "FAIL"}  ${String(duration).padStart(4)} ms  ${testCase.query}`);
  if (!passed) {
    failures += 1;
    console.error(JSON.stringify({ error: body.error, filters: body.filters, results: body.results?.slice(0, 3) }, null, 2));
  }
}
if (failures) {
  console.error(`${failures} search evaluation${failures === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${cases.length} search evaluations passed.`);
}
