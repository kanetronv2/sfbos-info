import type { ExtractedAmount, ExtractedFacts } from "./item-types";

const moneyPattern = /\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|b|m|k)?/gi;
const unitPattern = /\b([\d,]+)\s+(?:new\s+|net\s+|affordable\s+|residential\s+|dwelling\s+|housing\s+)*(?:housing\s+|residential\s+|dwelling\s+)?units?\b/gi;

export function extractItemFacts(title: string, content: string): ExtractedFacts {
  const text = `${title}\n${content}`;
  return {
    amounts: uniqueAmounts(text).slice(0, 20),
    housingUnits: uniqueNumbers(text, unitPattern).slice(0, 20),
    parties: extractParties(title),
  };
}

function uniqueAmounts(text: string): ExtractedAmount[] {
  const values = new Map<string, ExtractedAmount>();
  for (const match of text.matchAll(moneyPattern)) {
    const raw = match[0].replace(/\s+/g, " ").trim();
    const number = Number(match[1].replace(/,/g, ""));
    const multiplier = ({
      billion: 1_000_000_000,
      b: 1_000_000_000,
      million: 1_000_000,
      m: 1_000_000,
      thousand: 1_000,
      k: 1_000,
    } as Record<string, number>)[match[2]?.toLowerCase()] ?? 1;
    const value = Math.round(number * multiplier);
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 100), start);
    const nearby = text.slice(Math.max(0, start - 80), start + raw.length + 80);
    const qualifier = classifyAmount(before, nearby);
    values.set(`${value}:${qualifier}`, { raw, value, currency: "USD", qualifier });
  }
  return [...values.values()];
}

function classifyAmount(before: string, context: string): ExtractedAmount["qualifier"] {
  if (/\b(?:increase|increased|increasing|additional)[\s\S]{0,80}(?:(?:by|of)\s*)?$/i.test(before)) return "increase";
  if (/\b(?:decrease|decreased|decreasing|reduce|reduced|reduction)[\s\S]{0,80}(?:(?:by|of)\s*)?$/i.test(before)) return "decrease";
  if (/(?:not[- ]to[- ]exceed|\bNTE\b)[\s:]*$/i.test(before)) return "not-to-exceed";
  if (/appropriat|funding|expenditure/i.test(context)) return "appropriation";
  if (/revenue/i.test(context)) return "revenue";
  return "stated";
}

function uniqueNumbers(text: string, pattern: RegExp) {
  const values = new Set<number>();
  for (const match of text.matchAll(pattern)) values.add(Number(match[1].replace(/,/g, "")));
  return [...values].filter((value) => Number.isFinite(value) && value > 0);
}

function extractParties(title: string) {
  if (!/\b(?:agreement|contract|grant|lease)\b/i.test(title)) return [];
  const sections = title.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (sections.length < 2) return [];
  const candidates = sections.slice(1).filter((part) =>
    !/^\$|^(?:amendment|not to exceed|term|services?|funding|increase|decrease)\b/i.test(part) &&
    !/^(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(part)
  );
  return candidates.slice(0, 1);
}
