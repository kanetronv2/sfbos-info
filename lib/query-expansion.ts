export interface ExpandedQuery {
  original: string;
  interpreted: string[];
  searchQueries: string[];
}

const aliases: Array<{ pattern: RegExp; queries: string[] }> = [
  {
    pattern: /\b(?:killer|armed) robots?\b|\blethal force\b/i,
    queries: ['robot "deadly force"', 'robots "deadly force option"'],
  },
  {
    pattern: /\b(?:car[ -]?free|clos(?:e|ed|ing|ure))\s+(?:the\s+)?(?:jfk|john f\.? kennedy)(?:\s+drive)?\b|\bjfk drive\b/i,
    queries: ['"Golden Gate Park Access and Safety Program"', '"JFK Drive" private vehicles'],
  },
  {
    pattern: /\bfamily zoning(?: plan)?\b/i,
    queries: ['"Family Zoning Plan"', '"Housing Element 2022 Update" zoning'],
  },
  {
    pattern: /\bgreat highway closure\b|\bclos(?:e|ed|ing|ure) (?:of )?(?:the )?great highway\b/i,
    queries: ['"Great Highway" closed vehicles', '"Great Highway" closure'],
  },
  {
    pattern: /\bpolice overtime\b/i,
    queries: ['police overtime', '"Police Department" overtime appropriation'],
  },
  {
    pattern: /\brent control(?:led)?\b/i,
    queries: ['"rent control"', '"rent controlled"'],
  },
  {
    pattern: /\bfentanyl\b/i,
    queries: ['fentanyl', '"drug overdose"', 'opioid overdose'],
  },
  {
    pattern: /\burban alchemy\b/i,
    queries: ['"Urban Alchemy" agreement', '"Urban Alchemy" contract'],
  },
];

const questionWords = new Set([
  "a", "an", "and", "against", "all", "board", "did", "do", "does", "for", "from",
  "has", "have", "how", "in", "into", "many", "much", "of", "on", "or", "the", "to",
  "approve", "approved", "authorize", "authorized", "oppose", "opposed", "support", "supported",
  "vote", "voted", "votes", "what", "when", "which", "who", "why", "with",
]);

export function expandQuery(query: string): ExpandedQuery {
  const interpreted = new Set<string>();

  const normalized = query
    .replace(/\bSt\.?\b/gi, "Street")
    .replace(/\bAve\.?\b/gi, "Avenue")
    .replace(/\bBlvd\.?\b/gi, "Boulevard")
    .replace(/\bRd\.?\b/gi, "Road")
    .replace(/\bcontracts?\b/gi, "agreement");
  if (normalized.toLowerCase() !== query.toLowerCase()) interpreted.add(normalized);

  for (const alias of aliases) {
    if (alias.pattern.test(query)) alias.queries.forEach((value) => interpreted.add(value));
  }

  if (/\?$|^(?:how|what|when|where|which|who|why)\b/i.test(query)) {
    const topic = query
      .replace(/[^\p{L}\p{N}'-]+/gu, " ")
      .split(/\s+/)
      .filter((word) =>
        word.length > 1 &&
        !/^20\d{2}$/.test(word) &&
        !questionWords.has(word.toLowerCase())
      )
      .join(" ")
      .trim();
    if (topic.length >= 2 && topic.toLowerCase() !== query.toLowerCase()) {
      interpreted.add(topic);
      const agreementVariant = topic.replace(/\bcontracts?\b/gi, "agreement");
      if (agreementVariant !== topic) interpreted.add(agreementVariant);
    }
  }

  const interpretedQueries = [...interpreted].slice(0, 6);
  const exactPhraseOnly = /^\s*rent[- ]control(?:led)?\s*$/i.test(query);
  return {
    original: query,
    interpreted: interpretedQueries,
    searchQueries: exactPhraseOnly ? interpretedQueries : [query, ...interpretedQueries],
  };
}
