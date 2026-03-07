"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const PIXEL_WIDTH = 120;
const PIXEL_HEIGHT = 152;

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function ellipseMask(nx: number, ny: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

export function AboutPixelPortrait({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const draw = () => {
      const isDark = document.documentElement.classList.contains("dark");

      const palette = isDark
        ? [
            [8, 12, 26],
            [20, 42, 84],
            [89, 144, 222],
            [186, 220, 255],
          ]
        : [
            [214, 234, 255],
            [113, 170, 242],
            [33, 123, 236],
            [14, 54, 138],
          ];

      const imageData = context.createImageData(PIXEL_WIDTH, PIXEL_HEIGHT);
      const { data } = imageData;

      for (let y = 0; y < PIXEL_HEIGHT; y += 1) {
        for (let x = 0; x < PIXEL_WIDTH; x += 1) {
          const nx = x / (PIXEL_WIDTH - 1);
          const ny = y / (PIXEL_HEIGHT - 1);

          let value = 0.12;

          const body = ny > 0.52 && Math.abs(nx - 0.5) < 0.36 - (ny - 0.52) * 0.2;
          const neck = ny > 0.45 && ny < 0.56 && Math.abs(nx - 0.5) < 0.06;
          const head = ellipseMask(nx, ny, 0.5, 0.34, 0.18, 0.22);
          const hair = ellipseMask(nx, ny, 0.5, 0.24, 0.2, 0.16) && ny < 0.32;
          const glassesLeft = ellipseMask(nx, ny, 0.44, 0.34, 0.07, 0.05);
          const glassesRight = ellipseMask(nx, ny, 0.56, 0.34, 0.07, 0.05);
          const glassesBridge = ny > 0.33 && ny < 0.35 && nx > 0.48 && nx < 0.52;
          const laptop = ny > 0.66 && ny < 0.8 && nx > 0.28 && nx < 0.72;

          if (body) value = 0.48 + (0.7 - nx) * 0.08;
          if (neck) value = 0.56;
          if (head) value = 0.67 + (0.56 - nx) * 0.22 + (0.45 - ny) * 0.18;
          if (hair) value = 0.86;

          if (glassesLeft || glassesRight || glassesBridge) {
            value = 0.95;
          }

          if (laptop) {
            const hatch = ((x + y) % 10) / 10;
            value = 0.28 + hatch * 0.16;
          }

          const shoulderGlow = smoothStep(0.58, 0.8, ny) * (1 - Math.abs(nx - 0.5) * 1.9);
          value += shoulderGlow * 0.08;

          const bayer = BAYER_4X4[y % 4][x % 4] / 16;
          const dithered = clamp(value + (bayer - 0.5) * 0.22, 0, 1);

          let level = 0;
          if (dithered > 0.8) level = 3;
          else if (dithered > 0.56) level = 2;
          else if (dithered > 0.3) level = 1;

          const [red, green, blue] = palette[level] as [number, number, number];
          const offset = (y * PIXEL_WIDTH + x) * 4;

          data[offset] = red;
          data[offset + 1] = green;
          data[offset + 2] = blue;
          data[offset + 3] = 255;
        }
      }

      context.putImageData(imageData, 0, 0);
    };

    draw();

    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-none bg-muted/50 p-3", className)}>
      <canvas
        className="h-auto w-full bg-[#d8eaff] [image-rendering:pixelated] dark:bg-[#0d1f3f]"
        height={PIXEL_HEIGHT}
        ref={canvasRef}
        width={PIXEL_WIDTH}
      />
    </div>
  );
}
