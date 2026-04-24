import Image from "next/image";

import { createIdenticonDataUrl, type IdenticonColorScheme, type IdenticonVariant } from "@/lib/identicon";
import { cn } from "@/lib/utils";

type IdenticonAvatarProps = {
  seed: string;
  alt?: string;
  size?: number;
  className?: string;
  variant?: IdenticonVariant;
  colorScheme?: IdenticonColorScheme;
  monoChroma?: number;
  monoLightnessHigh?: number;
  monoLightnessLow?: number;
};

export function IdenticonAvatar({
  seed,
  alt,
  size = 20,
  className,
  variant = "bayer-4x4-mono-oklch",
  colorScheme = "oklch-mono",
  monoChroma,
  monoLightnessHigh,
  monoLightnessLow,
}: IdenticonAvatarProps) {
  const src = createIdenticonDataUrl(seed, {
    variant,
    size,
    colorScheme,
    monoChroma,
    monoLightnessHigh,
    monoLightnessLow,
  });

  return (
    <Image
      alt={alt ?? `${seed} identicon`}
      className={cn("rounded-full bg-muted object-cover", className)}
      height={size}
      src={src}
      unoptimized
      width={size}
    />
  );
}
