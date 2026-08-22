import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sfbos.info";
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/api`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/llms.txt`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
