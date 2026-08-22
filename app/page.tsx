import type { Metadata } from "next";
import { SearchApp } from "@/components/search-app";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: { absolute: "San Francisco Board of Supervisors Search" },
  description:
    "Search San Francisco Board of Supervisors agendas, minutes, legislative files, recorded votes, and public comments from 2012 onward.",
  alternates: {
    canonical: "/",
    types: {
      "text/markdown": "/index.md",
      "text/plain": "/llms.txt",
      "application/yaml": "/openapi.yaml",
    },
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "San Francisco Board of Supervisors Search",
    description:
      "Search agendas, minutes, legislative files, recorded votes, and public comments from 2012 onward.",
  },
};

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const siteUrl = getSiteUrl();
  const parameters = await searchParams;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "SF BOS Search",
      alternateName: "San Francisco Board of Supervisors Search",
      url: siteUrl,
      description: metadata.description,
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "San Francisco Board of Supervisors Agendas and Minutes Index",
      description:
        "Page-level extracted text, legislative files, recorded roll calls, and public-comment summaries from San Francisco Board of Supervisors agendas and minutes.",
      url: siteUrl,
      temporalCoverage: "2012/..",
      spatialCoverage: {
        "@type": "Place",
        name: "San Francisco, California",
      },
      isBasedOn: "https://sfbos.archive.sf.gov/meetings/full-board-meetings",
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/markdown",
          contentUrl: `${siteUrl}/index.md`,
        },
        {
          "@type": "DataDownload",
          encodingFormat: "application/yaml",
          contentUrl: `${siteUrl}/openapi.yaml`,
        },
      ],
    },
  ];

  return (
    <>
      <SearchApp
        initialQuery={first(parameters.q)}
        initialYear={first(parameters.year)}
        initialKind={first(parameters.kind)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
