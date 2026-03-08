"use client";

import dynamic from "next/dynamic";

const AboutPortrait = dynamic(
  () => import("@/components/about-portrait").then((module) => module.AboutPortrait),
  {
    ssr: false,
    loading: () => <div className="h-[240px] w-full animate-pulse rounded-none bg-black/80" />,
  },
);

export function AboutPortraitLazy({ className }: { className?: string }) {
  return <AboutPortrait className={className} />;
}
