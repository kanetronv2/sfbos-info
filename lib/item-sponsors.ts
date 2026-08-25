export function extractSponsorText(content: string): string | null {
  const lines = content.split("\n").map((line) => line.replace(/\s+/g, " ").trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labeled = line.match(/^Sponsors?\s*:\s*(.*)$/i);
    const legacy = line.match(/^Sponsor\s+Supervisors?\s+(.*)$/i);
    if (!labeled && !legacy) continue;
    return collectWrappedAttribution(lines, index, labeled?.[1] ?? legacy?.[1] ?? "");
  }

  const introductoryLines = lines.slice(0, 18);
  const descriptionIndex = introductoryLines.findIndex(isLegislativeDescription);
  const attributionLines = descriptionIndex >= 0
    ? introductoryLines.slice(0, descriptionIndex)
    : introductoryLines.slice(0, 8);
  for (const line of attributionLines) {
    const attribution = line.match(/^Supervisors?\s+(.+)$/i)?.[1];
    if (attribution && looksLikeNames(attribution)) return cleanAttribution(attribution);
  }

  return null;
}

function collectWrappedAttribution(lines: string[], startIndex: number, initialValue: string) {
  let value = initialValue.trim();
  let index = startIndex;
  while ((!value || /(?:[,;]|\band)$/i.test(value)) && index + 1 < lines.length) {
    index += 1;
    if (!lines[index]) continue;
    if (isLegislativeDescription(lines[index])) break;
    value = `${value} ${lines[index]}`.trim();
  }
  return cleanAttribution(value);
}

function cleanAttribution(value: string) {
  const cleaned = value
    .replace(/^Supervisors?\s+/i, "")
    .replace(/[.;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function looksLikeNames(value: string) {
  return value.length <= 220
    && !/\b(?:moved|requested|seconded|stated|indicated|introduced|ordinance|resolution|motion)\b/i.test(value);
}

function isLegislativeDescription(value: string) {
  return /^(?:Ordinance|Resolution|Motion|Hearing|Charter Amendment|Administrative Code|Appropriation|Appointment|Settlement)\b/i.test(value);
}
