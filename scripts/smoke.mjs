const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const cases = [
  {
    name: "natural-language evidence bundle",
    path: "/api/query?q=How+many+housing+units+has+Connie+Chan+voted+against%3F+Which+addresses%3F+Use+https%3A%2F%2Fsfbos.info",
    test: (body) =>
      body.interpretation?.voter === "Chan" &&
      body.interpretation?.housingIntent === true &&
      body.legislativeItems?.results?.length > 0 &&
      body.legislativeItems.results.every((item) =>
        Array.isArray(item.extracted?.addresses) && item.markdownUrl?.includes(".md?pages=")
      ),
  },
  {
    name: "469 Stevenson vote",
    path: "/api/items?q=469+Stevenson&voter=Chan&from=2021&to=2021&groupBy=file",
    test: (body) => body.results.some((item) =>
      item.fileNumber === "210920" &&
      item.transcriptUrl.includes("/documents/") &&
      item.transcriptUrl.includes("#file-210920") &&
      item.markdownUrl.includes(".md?pages=") &&
      item.officialUrl.startsWith("https://")
    ),
  },
  {
    name: "killer robots alias",
    path: "/api/items?q=Who+voted+to+authorize+police+killer+robots+in+2022%3F&from=2022&to=2022&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "220641"),
  },
  {
    name: "car-free JFK alias and final action",
    path: "/api/items?q=Who+voted+to+make+JFK+Drive+car-free%3F&from=2022&to=2022&final=true&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "220261" && item.rollCalls.some((vote) => vote.isFinal)),
  },
  {
    name: "Housing Production natural question",
    path: "/api/items?q=Who+voted+against+the+2023+Housing+Production+ordinance%3F&from=2023&to=2023&final=true&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "230446"),
  },
  {
    name: "police overtime structured amounts",
    path: "/api/items?q=police+overtime&from=2023&to=2023&final=true&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "230158" && item.extracted.amounts.length >= 5),
  },
  {
    name: "Urban Alchemy agreement parties",
    path: "/api/items?q=Which+Urban+Alchemy+contracts+did+the+Board+approve%2C+and+for+how+much%3F&from=2021&to=2026&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "211306" && item.extracted.parties.includes("Urban Alchemy")),
  },
  {
    name: "speaker-level Great Highway comments",
    path: "/api/comments?q=Great+Highway&from=2021&to=2021",
    test: (body) => body.results.length >= 4 && body.results.every((comment) => comment.speaker && comment.statement),
  },
  {
    name: "rent-control phrase precision",
    path: "/api/items?q=rent+control&from=2021&to=2026&final=true&groupBy=file&limit=50",
    test: (body) => body.results.some((item) => item.fileNumber === "240880") && !body.results.some((item) => item.fileNumber === "250084"),
  },
  {
    name: "Gaza ceasefire final vote",
    path: "/api/items?q=Gaza+ceasefire&from=2023&to=2024&final=true&groupBy=file",
    test: (body) => body.results.some((item) => item.fileNumber === "231263" && item.rollCalls.some((vote) => vote.isFinal)),
  },
  {
    name: "Family Zoning companion grouping",
    path: "/api/items?q=Family+Zoning+Plan&from=2025&to=2025&final=true&groupBy=matter",
    test: (body) => body.total === 1 && body.results[0]?.groupCount >= 3,
  },
  {
    name: "deterministic supervisor aggregation",
    path: "/api/aggregates/votes?voter=Chan&position=no&from=2021&to=2026&groupBy=file&limit=5",
    test: (body) => body.voter?.slug === "connie-chan" && body.total > 0 && body.results.every((result) => result.recordedPosition === "no" && result.transcriptUrl.includes(`#file-${result.fileNumber}`)),
  },
  {
    name: "hybrid search explicit fallback",
    path: "/api/search?q=affordable+housing&mode=hybrid&limit=2",
    test: (body) => body.retrieval?.requested === "hybrid" && ["hybrid", "lexical"].includes(body.retrieval?.used),
  },
  {
    name: "recorded-position snapshot",
    path: "/api/snapshots/recorded-positions?limit=2",
    test: (body) => body.schemaVersion === "1.0.0" && body.records?.length === 2 && body.records[0]?.documentId,
  },
  {
    name: "change feed",
    path: "/api/changes?cursor=0&limit=2",
    test: (body) => body.schemaVersion === "1.0.0" && body.changes?.length > 0,
  },
  {
    name: "data-quality coverage",
    path: "/api/quality",
    test: (body) => body.metrics?.documents === 1149 && body.metrics?.documents_without_versions === 0,
  },
];

let failures = 0;
for (const check of cases) {
  const response = await fetch(`${baseUrl}${check.path}`);
  const body = await response.json();
  const passed = response.ok && check.test(body);
  console.log(`${passed ? "PASS" : "FAIL"}  ${check.name}`);
  if (!passed) {
    failures += 1;
    console.error(JSON.stringify(body, null, 2).slice(0, 3000));
  }
}

const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
const mcp = await mcpResponse.json();
const mcpPassed = mcpResponse.ok && mcp.result?.tools?.some((tool) => tool.name === "aggregate_recorded_votes");
console.log(`${mcpPassed ? "PASS" : "FAIL"}  MCP tool discovery`);
if (!mcpPassed) failures += 1;

const transcriptResponse = await fetch(`${baseUrl}/documents/800/2021-10-26-minutes`);
const transcriptHtml = await transcriptResponse.text();
const transcriptLinksPassed = transcriptResponse.ok &&
  transcriptHtml.includes('href="/supervisors/connie-chan"') &&
  transcriptHtml.includes('class="supervisor-name-link"');
console.log(`${transcriptLinksPassed ? "PASS" : "FAIL"}  transcript supervisor profile links`);
if (!transcriptLinksPassed) failures += 1;

const structuredRowStart = transcriptHtml.indexOf('id="file-210920"');
const structuredRowEnd = transcriptHtml.indexOf("</details>", structuredRowStart);
const structuredRowHtml = transcriptHtml.slice(structuredRowStart, structuredRowEnd);
const sourcePagePassed = structuredRowStart >= 0 &&
  structuredRowHtml.includes("class=\"structured-source-link\"") &&
  structuredRowHtml.includes("#page=17") &&
  structuredRowHtml.includes('aria-label="Open PAGE 17 in the official PDF"');
console.log(`${sourcePagePassed ? "PASS" : "FAIL"}  structured row official source page`);
if (!sourcePagePassed) failures += 1;

const unanimousResponse = await fetch(`${baseUrl}/documents/824/2022-02-08-minutes`);
const unanimousHtml = await unanimousResponse.text();
const unanimousStart = unanimousHtml.indexOf('id="file-211306"');
const unanimousEnd = unanimousHtml.indexOf("</details>", unanimousStart);
const unanimousRecordHtml = unanimousHtml.slice(unanimousStart, unanimousEnd);
const unanimousEmptySidePassed = unanimousResponse.ok &&
  unanimousStart >= 0 &&
  /Ayes(?:<!-- -->)?:/.test(unanimousRecordHtml) &&
  /Noes(?:<!-- -->)?:/.test(unanimousRecordHtml) &&
  unanimousRecordHtml.includes("None");
console.log(`${unanimousEmptySidePassed ? "PASS" : "FAIL"}  unanimous vote explicit empty side`);
if (!unanimousEmptySidePassed) failures += 1;

const supervisorResponse = await fetch(`${baseUrl}/supervisors/connie-chan`);
const supervisorHtml = await supervisorResponse.text();
const contactPassed = supervisorResponse.ok &&
  supervisorHtml.includes("ChanStaff@sfgov.org") &&
  supervisorHtml.includes("(415) 554-7410") &&
  supervisorHtml.includes("Official current roster");
console.log(`${contactPassed ? "PASS" : "FAIL"}  current supervisor contact profile`);
if (!contactPassed) failures += 1;

const supervisorIndexResponse = await fetch(`${baseUrl}/supervisors`);
const supervisorIndexHtml = await supervisorIndexResponse.text();
const currentBadgeCount = (supervisorIndexHtml.match(/class="current-badge"/g) ?? []).length;
const districtCount = (supervisorIndexHtml.match(/class="entity-district"/g) ?? []).length;
const currentSupervisorsFirst = supervisorIndexResponse.ok &&
  currentBadgeCount === 11 &&
  districtCount === 36 &&
  supervisorIndexHtml.indexOf("Connie Chan") < supervisorIndexHtml.indexOf("John Avalos") &&
  !supervisorIndexHtml.includes("District unknown");
console.log(`${currentSupervisorsFirst ? "PASS" : "FAIL"}  supervisor index current ordering and districts`);
if (!currentSupervisorsFirst) failures += 1;

const homeResponse = await fetch(baseUrl);
const homeHtml = await homeResponse.text();
const analyticsPassed = homeResponse.ok &&
  homeHtml.includes("googletagmanager.com/gtag/js?id=G-Q4NGCL52JK") &&
  homeHtml.includes("G-Q4NGCL52JK");
console.log(`${analyticsPassed ? "PASS" : "FAIL"}  GA4 measurement tag`);
if (!analyticsPassed) failures += 1;

const modelCalloutRemoved = homeResponse.ok &&
  !homeHtml.includes("DESIGNED FOR LLM") &&
  !homeHtml.includes("model-callout");
console.log(`${modelCalloutRemoved ? "PASS" : "FAIL"}  homepage model callout removed`);
if (!modelCalloutRemoved) failures += 1;

const iconResponse = await fetch(`${baseUrl}/icon.svg`);
const iconSvg = await iconResponse.text();
const citySealIconPassed = iconResponse.ok &&
  iconSvg.includes("Seal of the City and County of San Francisco") &&
  iconSvg.includes("data:image/png;base64,");
console.log(`${citySealIconPassed ? "PASS" : "FAIL"}  San Francisco seal favicon asset`);
if (!citySealIconPassed) failures += 1;

if (failures) {
  console.error(`${failures} infrastructure smoke test${failures === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${cases.length + 9} infrastructure smoke tests passed against ${baseUrl}.`);
}
