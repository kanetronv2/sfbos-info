import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { listDocuments } from "@/lib/documents";
import { listSupervisors } from "@/lib/supervisors";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const documents = await listDocuments();
  const supervisors = await listSupervisors();
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/documents`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/api`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/supervisors`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/quality`, changeFrequency: "weekly", priority: 0.4 },
    ...supervisors.filter((supervisor) => supervisor.recordedPositions > 0).map((supervisor) => ({
      url: `${baseUrl}/supervisors/${supervisor.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...documents.map((document) => ({
      url: `${baseUrl}${document.transcriptPath}`,
      lastModified: new Date(`${document.meetingDate}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
