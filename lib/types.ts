export type DocumentKind = "agenda" | "minutes";

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
  snippet: string;
  score: number;
  lexicalScore?: number;
  semanticScore?: number | null;
}

export interface SearchResponse {
  query: string;
  interpretedQueries: string[];
  filters: {
    year: number | null;
    kind: DocumentKind | null;
  };
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
