import { ImageResponse } from "next/og";

import { createIdenticonDataUrl } from "@/lib/identicon";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  const src = createIdenticonDataUrl("arcory-logo", {
    variant: "bayer-4x4-mono-oklch",
    monoChroma: 0,
    monoLightnessHigh: 0.84,
    monoLightnessLow: 0.12,
    size: 32,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderRadius: "9999px",
        }}
      >
        {/* 与导航中的 IdenticonAvatar 使用同一套 seed/参数 */}
        <img
          alt="Arcory"
          height={32}
          src={src}
          style={{
            width: 32,
            height: 32,
            objectFit: "cover",
          }}
          width={32}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
