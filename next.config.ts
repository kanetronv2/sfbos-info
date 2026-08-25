import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api.sf.gov",
        pathname: "/original_images/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: '</index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby", </openapi.yaml>; rel="service-desc"; type="application/yaml"',
          },
          {
            key: "Vary",
            value: "Accept, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
          destination: "/index.md",
        },
        {
          source: "/documents/:id/:slug.md",
          destination: "/api/documents/:id",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
