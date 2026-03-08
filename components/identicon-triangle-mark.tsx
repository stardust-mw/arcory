import Image from "next/image";

import { createChromaticAberrationTriangleDataUrl } from "@/lib/identicon";
import { cn } from "@/lib/utils";

type IdenticonTriangleMarkProps = {
  seed: string;
  size?: number;
  className?: string;
};

export function IdenticonTriangleMark({
  seed,
  size = 12,
  className,
}: IdenticonTriangleMarkProps) {
  const src = createChromaticAberrationTriangleDataUrl(seed, 48);

  return (
    <Image
      alt="arcory mark"
      className={cn("shrink-0 object-contain", className)}
      height={size}
      src={src}
      unoptimized
      width={size}
    />
  );
}
