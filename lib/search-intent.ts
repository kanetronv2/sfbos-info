import type { SearchResultType } from "./types";
import type { VotePosition } from "./item-types";

export const MIN_ARCHIVE_YEAR = 2012;
export const MAX_ARCHIVE_YEAR = 2026;

export const supervisorNames = [
  "Avalos", "Breed", "Brown", "Campos", "Chan", "Christensen", "Chiu", "Chu", "Cohen",
  "Dorsey", "Elsbernd", "Engardio", "Farrell", "Fewer", "Fielder", "Haney", "Kim", "Mahmood",
  "Mandelman", "Mar", "Melgar", "Olague", "Peskin", "Preston", "Ronen", "Safai", "Sauter",
  "Sheehy", "Stefani", "Tang", "Walton", "Wiener", "Yee",
] as const;

export interface SearchIntent {
  searchQuery: string;
  voter: string | null;
  recordedPosition: VotePosition | null;
  fromYear: number;
  toYear: number;
  voteIntent: boolean;
  housingIntent: boolean;
  commentIntent: boolean;
  finalOnly: boolean;
  suggestedType: SearchResultType;
}

export function interpretSearchQuestion(question: string): SearchIntent {
  const withoutUrl = question.replace(/https?:\/\/\S+/gi, " ");
  const voter = supervisorNames.find((name) => new RegExp(`\\b${name}\\b`, "i").test(withoutUrl)) ?? null;
  const years = [...withoutUrl.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= MIN_ARCHIVE_YEAR && year <= MAX_ARCHIVE_YEAR);
  const housingIntent = /\b(?:housing|dwelling|residential)\s+units?\b|\bhousing\b/i.test(withoutUrl);
  const commentIntent = /\b(?:public comment|commenter|speaker|testif(?:y|ied|ies))\b/i.test(withoutUrl);
  const voteIntent = /\b(?:vote|voted|ayes?|noes?|against|support|oppose|passed|approved)\b/i.test(withoutUrl);
  const finalOnly = /\b(?:final|finally|enacted|adopted)\b/i.test(withoutUrl);
  const recordedPosition = /\b(?:against|oppos(?:e|ed|ition)|voted?\s+no)\b/i.test(withoutUrl)
    ? "no" as const
    : /\b(?:support(?:ed)?|voted?\s+(?:aye|yes))\b/i.test(withoutUrl)
      ? "aye" as const
      : /\babsent\b/i.test(withoutUrl)
        ? "absent" as const
        : /\bexcused\b/i.test(withoutUrl)
          ? "excused" as const
          : null;

  let searchQuery: string;
  if (housingIntent && voteIntent && voter) {
    searchQuery = '"dwelling units" OR "residential unit" OR "housing units"';
  } else {
    searchQuery = withoutUrl
      .replace(voter ? new RegExp(`\\b${voter}\\b`, "gi") : /$^/, " ")
      .replace(/\b(?:how|many|much|what|when|where|which|who|why|did|does|has|have|use|find|show|tell|vote|voted|against|support|supported|oppose|opposed|final|finally)\b/gi, " ")
      .replace(/\b20\d{2}\b/g, " ")
      .replace(/[^\p{L}\p{N}'"#.-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (searchQuery.length < 2) searchQuery = withoutUrl.trim();
  }

  return {
    searchQuery,
    voter,
    recordedPosition,
    fromYear: years.length ? Math.min(...years) : MIN_ARCHIVE_YEAR,
    toYear: years.length ? Math.max(...years) : MAX_ARCHIVE_YEAR,
    voteIntent,
    housingIntent,
    commentIntent,
    finalOnly,
    suggestedType: commentIntent ? "comments" : voteIntent ? "votes" : "all",
  };
}
