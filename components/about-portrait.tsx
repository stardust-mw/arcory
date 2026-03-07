"use client";

import { useEffect, useState } from "react";

import { AboutPixelPortrait } from "@/components/about-pixel-portrait";
import { cn } from "@/lib/utils";

const CANDIDATE_SOURCES = ["/portrait.webp", "/portrait.png", "/portrait.jpg", "/portrait.jpeg"];

export function AboutPortrait({ className }: { className?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const tryLoad = async () => {
      for (const source of CANDIDATE_SOURCES) {
        // Probe with Image so decode failures also trigger fallback.
        const loaded = await new Promise<boolean>((resolve) => {
          const probe = new window.Image();
          probe.onload = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = `${source}?v=${Date.now()}`;
        });

        if (cancelled) return;
        if (loaded) {
          setResolvedSrc(source);
          setLoadFailed(false);
          return;
        }
      }

      if (!cancelled) {
        setResolvedSrc(null);
        setLoadFailed(true);
      }
    };

    void tryLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return <AboutPixelPortrait className={className} />;
  }

  if (!resolvedSrc) {
    return <div className={cn("h-[240px] w-full rounded-none bg-black", className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-none bg-black p-0", className)}>
      <img alt="Portrait" className="h-auto w-full object-cover [image-rendering:pixelated]" src={resolvedSrc} />
    </div>
  );
}
