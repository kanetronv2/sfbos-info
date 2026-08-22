export type VotePosition = "aye" | "no" | "absent" | "excused";
export type GroupBy = "none" | "file" | "matter";
export type ActionType =
  | "final-passage"
  | "first-reading"
  | "adoption"
  | "approval"
  | "amendment"
  | "continuance"
  | "referral"
  | "tabling"
  | "rejection"
  | "rescission"
  | "other";

export interface RollCall {
  sequence: number;
  action: string;
  actionType: ActionType;
  isFinal: boolean;
  ayes: string[];
  noes: string[];
  absent: string[];
  excused: string[];
}

export interface ExtractedAmount {
  raw: string;
  value: number;
  currency: "USD";
  qualifier: "not-to-exceed" | "increase" | "decrease" | "appropriation" | "revenue" | "stated";
}

export interface ExtractedFacts {
  amounts: ExtractedAmount[];
  housingUnits: number[];
  addresses: string[];
  parties: string[];
}

export interface LegislativeItemResult {
  id: string;
  meetingDate: string;
  year: number;
  fileNumber: string;
  matter: string;
  title: string;
  transcriptUrl: string;
  markdownUrl: string;
  officialUrl: string;
  startPage: number;
  endPage: number;
  snippet: string;
  score: number;
  groupCount: number;
  extractionConfidence: number | null;
  parserVersion: string | null;
  extracted: ExtractedFacts;
  rollCalls: RollCall[];
}

export interface LegislativeItemResponse {
  query: string;
  filters: {
    voter: string | null;
    position: VotePosition | null;
    final: boolean;
    groupBy: GroupBy;
    fromYear: number;
    toYear: number;
  };
  interpretedQueries: string[];
  total: number;
  returned: number;
  results: LegislativeItemResult[];
}
