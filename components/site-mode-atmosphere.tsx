"use client";

import { useEffect, useRef, useState } from "react";

import { type SiteMode, type SiteModeAtmosphereConfig } from "@/lib/site-mode";

export function SiteModeAtmosphere({ activeMode, config }: { activeMode: SiteMode; config: SiteModeAtmosphereConfig }) {
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (activeMode !== config.mode) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    if (video.readyState >= 2) {
      const rafId = window.requestAnimationFrame(() => {
        setIsReady(true);
      });
      void video.play().catch(() => {});
      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }

    const handleLoadedData = () => {
      setIsReady(true);
      void video.play().catch(() => {});
    };

    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    video.load();

    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
    };
  }, [activeMode, config.mode]);

  return (
    <video
      aria-hidden="true"
      className={`arcory-atmosphere ${config.className}`}
      data-mode={config.mode}
      data-ready={isReady ? "true" : "false"}
      loop
      muted
      playsInline
      preload="auto"
      ref={videoRef}
      src={config.src}
    />
  );
}
