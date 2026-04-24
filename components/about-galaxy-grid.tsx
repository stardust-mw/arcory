import Image from "next/image";

import { cn } from "@/lib/utils";

const HUBBLE_IMAGE_SRC = "/galaxy/hubble-ultra-deep-field.webp";

export function AboutGalaxyGrid({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-72 w-full overflow-hidden rounded-none sm:h-96 md:h-[440px]", className)}>
      <Image
        alt="Hubble Ultra Deep Field"
        className="object-cover object-center"
        decoding="async"
        fill
        priority={false}
        sizes="(max-width: 768px) 100vw, 768px"
        src={HUBBLE_IMAGE_SRC}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.18)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,transparent_20%,transparent_72%,rgba(0,0,0,0.28)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,transparent_100%)] mix-blend-screen" />
    </div>
  );
}
