import { getSiteUrl } from "./site-url";

export function documentSlug(meetingDate: string, kind: string) {
  return `${meetingDate}-${kind}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
}

export function documentPath(id: string, meetingDate: string, kind: string, page?: number) {
  const path = `/documents/${encodeURIComponent(id)}/${documentSlug(meetingDate, kind)}`;
  return page ? `${path}#page-${page}` : path;
}

export function documentUrl(id: string, meetingDate: string, kind: string, page?: number) {
  return `${getSiteUrl()}${documentPath(id, meetingDate, kind, page)}`;
}
