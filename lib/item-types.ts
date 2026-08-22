export type VotePosition = "aye" | "no" | "absent" | "excused";

export interface RollCall {
  sequence: number;
  action: string;
  ayes: string[];
  noes: string[];
  absent: string[];
  excused: string[];
}

export interface LegislativeItemResult {
  id: string;
  meetingDate: string;
  year: number;
  fileNumber: string;
  title: string;
  officialUrl: string;
  startPage: number;
  endPage: number;
  snippet: string;
  score: number;
  rollCalls: RollCall[];
}

export interface LegislativeItemResponse {
  query: string;
  filters: {
    voter: string | null;
    position: VotePosition | null;
    fromYear: number;
    toYear: number;
  };
  total: number;
  returned: number;
  results: LegislativeItemResult[];
}
