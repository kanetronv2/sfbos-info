const START_MARKER = "<sfbos-match>";
const STOP_MARKER = "</sfbos-match>";

export const SEARCH_HEADLINE_MARKERS = `StartSel=${START_MARKER}, StopSel=${STOP_MARKER}`;

export function cleanSearchHeadline(value: string) {
  return value
    .replaceAll(START_MARKER, "")
    .replaceAll(STOP_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
}
