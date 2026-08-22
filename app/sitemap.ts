import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { listDocuments } from "@/lib/documents";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const documents = await listDocuments();
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/documents`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/api`, changeFrequency: "monthly", priority: 0.7 },
    ...documents.map((document) => ({
      url: `${baseUrl}${document.transcriptPath}`,
      lastModified: new Date(`${document.meetingDate}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
