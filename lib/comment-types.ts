export interface PublicCommentResult {
  id: string;
  meetingDate: string;
  year: number;
  speaker: string;
  statement: string;
  officialUrl: string;
  page: number;
  score: number;
}

export interface PublicCommentResponse {
  query: string;
  interpretedQueries: string[];
  filters: {
    speaker: string | null;
    fromYear: number;
    toYear: number;
  };
  total: number;
  returned: number;
  results: PublicCommentResult[];
}
