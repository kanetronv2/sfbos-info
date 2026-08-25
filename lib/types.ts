export type DocumentKind = "agenda" | "minutes";
export type SearchResultType = "all" | "legislation" | "votes" | "comments" | "pages";
export type SearchResultEntity = Exclude<SearchResultType, "all">;

export interface SearchResult {
  id: string;
  meetingDate: string;
  year: number;
  kind: DocumentKind;
  title: string;
  transcriptUrl: string;
  markdownUrl: string;
  officialUrl: string;
  page: number;
  fileNumber?: string;
  snippet: string;
  score: number;
  lexicalScore?: number;
  semanticScore?: number | null;
  resultType?: SearchResultEntity;
  matter?: string;
  speaker?: string;
  groupCount?: number;
  matchCount?: number;
  action?: string;
  actionType?: string;
  isFinal?: boolean;
  recordedPosition?: "aye" | "no" | "absent" | "excused";
  ayes?: string[];
  noes?: string[];
  absent?: string[];
  excused?: string[];
  extracted?: {
    amounts: Array<{ raw: string; value: number; currency: "USD"; qualifier: string }>;
    housingUnits: number[];
    addresses: string[];
    parties: string[];
  };
  matchedEntities?: string[];
}

export interface SearchResponse {
  query: string;
  interpretedQueries: string[];
  filters: {
    year: number | null;
    kind: DocumentKind | null;
    type?: SearchResultType;
    fromYear?: number;
    toYear?: number;
    supervisor?: string | null;
    position?: "aye" | "no" | "absent" | "excused" | null;
    final?: boolean;
  };
  intent?: {
    searchQuery: string;
    suggestedType: SearchResultType;
    voteIntent: boolean;
    commentIntent: boolean;
    housingIntent: boolean;
  };
  facets?: {
    legislation: number;
    votes: number;
    comments: number;
    pages: number;
  };
  correction?: string | null;
  total: number;
  returned: number;
  source: "postgres" | "preview";
  retrieval: {
    requested: "lexical" | "hybrid";
    used: "lexical" | "hybrid";
    embeddingModel: string | null;
    semanticCoverage: number;
    fallbackReason: string | null;
  };
  results: SearchResult[];
}
