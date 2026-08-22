import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sfbos.info";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SF BOS Search",
    template: "%s · SF BOS Search",
  },
  description:
    "Search agendas and minutes from the San Francisco Board of Supervisors, with official source links and an LLM-friendly API.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "SF BOS Search",
    description:
      "Full-text search across San Francisco Board of Supervisors agendas and minutes.",
  },
  twitter: {
    card: "summary",
    title: "SF BOS Search",
    description:
      "Full-text search across San Francisco Board of Supervisors agendas and minutes.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
