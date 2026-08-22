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
      item.transcriptUrl.includes("#page-") &&
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

if (failures) {
  console.error(`${failures} infrastructure smoke test${failures === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${cases.length} infrastructure smoke tests passed against ${baseUrl}.`);
}
