"use client";

import dynamic from "next/dynamic";

const AboutCosmosAnimation = dynamic(
  () => import("@/components/about-cosmos-animation").then((module) => module.AboutCosmosAnimation),
  {
    ssr: false,
    loading: () => <div className="h-[340px] w-full animate-pulse rounded-none bg-black/80" />,
  },
);

export function AboutCosmosLazy() {
  return <AboutCosmosAnimation />;
}
