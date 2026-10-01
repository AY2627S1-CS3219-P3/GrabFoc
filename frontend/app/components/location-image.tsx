/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Rendered remote location thumbnails directly in the browser to avoid server-side image fetch failures; retained the missing-image fallback.
Author review: Pending human review.
*/
"use client";

import Image from "next/image";
import { useState } from "react";

export function locationImageSource(source: string | null): string | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    return url.protocol === "https:" ? source : null;
  } catch { return null; }
}

// AI-generated (pending human review)
export function LocationImage({ source, name }: { source: string | null; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageSource = locationImageSource(source);
  const showImage = imageSource !== null && imageSource !== failedSource;

  return <div className="location-card-image">
    {showImage && imageSource ? <Image
      src={imageSource}
      alt={`${name} location`}
      fill
      sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
      loading="lazy"
      unoptimized
      onError={() => setFailedSource(imageSource)}
    /> : <span className="location-image-fallback" aria-label="No location image available">No image available</span>}
  </div>;
}
