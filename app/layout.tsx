import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: "SF BOS Search",
  title: {
    default: "San Francisco Board of Supervisors Search",
    template: "%s · SF BOS Search",
  },
  description:
    "Search agendas and minutes from the San Francisco Board of Supervisors, with official source links and a provider-neutral machine-readable API.",
  keywords: [
    "San Francisco Board of Supervisors",
    "SF Board of Supervisors votes",
    "San Francisco legislation",
    "Board of Supervisors agendas",
    "Board of Supervisors minutes",
    "San Francisco public records",
  ],
  creator: "SF BOS Search",
  publisher: "SF BOS Search",
  category: "government public records",
  formatDetection: { address: false, email: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "SF BOS Search",
    title: "San Francisco Board of Supervisors Search",
    description:
      "Search San Francisco Board of Supervisors agendas, minutes, legislative files, and recorded votes.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "San Francisco Board of Supervisors Search",
    description:
      "Search San Francisco Board of Supervisors agendas, minutes, legislative files, and recorded votes.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="describedby" href="/llms.txt" />
        <link rel="service-desc" type="application/yaml" href="/openapi.yaml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
