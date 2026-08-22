import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/documents`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/api`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/llms.txt`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
