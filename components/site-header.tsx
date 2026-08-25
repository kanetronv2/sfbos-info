"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";

export function SiteHeader({ onHomeClick }: { onHomeClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="SF BOS Search home" onClick={onHomeClick}>
        <span className="prompt-mark" aria-hidden="true">&gt;_</span>
        <span>sfbos.info</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/">SEARCH</Link>
        <Link href="/documents">PDFS</Link>
        <Link href="/supervisors">SUPERVISORS</Link>
        <Link href="/api">API</Link>
        <a href="/llms.txt">FOR MODELS</a>
      </nav>
    </header>
  );
}
