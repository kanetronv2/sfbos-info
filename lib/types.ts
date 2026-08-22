export type DocumentKind = "agenda" | "minutes";

export interface SearchResult {
  id: string;
  meetingDate: string;
  year: number;
  kind: DocumentKind;
  title: string;
  officialUrl: string;
  page: number;
  snippet: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  filters: {
    year: number | null;
    kind: DocumentKind | null;
  };
  total: number;
  returned: number;
  source: "postgres" | "preview";
  results: SearchResult[];
}
