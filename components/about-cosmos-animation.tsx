"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function AboutCosmosAnimation({ className }: { className?: string }) {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setShowVideo(true);
    }, 280);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  return (
    <div className={cn("relative h-[340px] w-full overflow-hidden rounded-none bg-black", className)}>
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        src="/black-hole-poster.jpg"
      />
      {showVideo ? (
        <video
          autoPlay
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          loop
          muted
          playsInline
          preload="none"
        >
          <source src="/black-hole.web.mp4" type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
