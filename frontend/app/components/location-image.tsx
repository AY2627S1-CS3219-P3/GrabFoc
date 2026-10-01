/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Added lazy location thumbnails and omitted empty image panels after UI review.
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
  if (!imageSource) return null;
  const showImage = imageSource !== failedSource;

  return <div className="location-card-image">
    {showImage ? <Image
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
