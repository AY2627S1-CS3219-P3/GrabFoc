/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Added lazy location thumbnails with optimized seeded images and a stable fallback.
Author review: Pending human review.
*/
"use client";

import Image from "next/image";
import { useState } from "react";

function optimizedSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" &&
      url.pathname.startsWith("/CS3219-AY2627S1/FoC-Template/");
  } catch { return false; }
}

// AI-generated (pending human review)
export function LocationImage({ source, name }: { source: string | null; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(source && source !== failedSource && /^https:\/\//i.test(source));

  return <div className="location-card-image">
    {showImage && source ? <Image
      src={source}
      alt={`${name} location`}
      fill
      sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
      loading="lazy"
      unoptimized={!optimizedSource(source)}
      onError={() => setFailedSource(source)}
    /> : <span className="location-image-fallback" aria-label="No location image available">No image available</span>}
  </div>;
}
