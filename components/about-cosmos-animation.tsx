"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const TWO_PI = Math.PI * 2;

function fract(value: number) {
  return value - Math.floor(value);
}

function hashNoise(value: number) {
  return fract(Math.sin(value * 12.9898) * 43758.5453123);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);

  const vignette = context.createRadialGradient(width * 0.5, height * 0.56, 32, width * 0.5, height * 0.56, width * 0.75);
  vignette.addColorStop(0, "rgba(255,255,255,0.02)");
  vignette.addColorStop(0.4, "rgba(255,255,255,0.012)");
  vignette.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawSparseStars(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const stars = [
    { x: width * 0.83, y: height * 0.28, seed: 0.13 },
    { x: width * 0.18, y: height * 0.18, seed: 0.47 },
    { x: width * 0.62, y: height * 0.2, seed: 0.81 },
  ];

  for (const star of stars) {
    const alpha = 0.12 + (Math.sin(time * 1.1 + star.seed * 7) * 0.5 + 0.5) * 0.24;
    context.fillStyle = `rgba(245,248,255,${alpha.toFixed(3)})`;
    context.fillRect(star.x, star.y, 1.6, 1.6);
  }
}

function drawAccretionWisps(
  context: CanvasRenderingContext2D,
  width: number,
  centerX: number,
  centerY: number,
  horizonRadius: number,
  time: number,
) {
  const spread = width * 0.44;
  const samples = 190;
  const layers = 96;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let layer = 0; layer < layers; layer += 1) {
    const lane = layer / (layers - 1);
    const edgeWeight = 1 - lane;
    const alpha = 0.014 + Math.pow(edgeWeight, 1.85) * 0.2;
    const lineWidth = 0.65 + Math.pow(edgeWeight, 2) * 1.2;
    const drift = (hashNoise(layer * 5.21 + 0.7) - 0.5) * 10;
    const phase = time * (0.14 + hashNoise(layer * 3.17 + 1.3) * 0.55) + layer * 0.48;

    context.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    context.lineWidth = lineWidth;

    const drawSide = (direction: 1 | -1) => {
      context.beginPath();

      for (let step = 0; step <= samples; step += 1) {
        const t = step / samples;
        const xNorm = t * 2 - 1;
        const x = centerX + xNorm * spread;
        const absX = Math.abs(xNorm);

        const envelope = Math.pow(Math.max(0, 1 - absX), 1.48);
        const base = (12 + lane * 56) * envelope;

        const centerInfluence = Math.max(0, 1 - Math.abs(x - centerX) / (horizonRadius * 1.95));
        const lensLift = Math.pow(centerInfluence, 2.4) * (horizonRadius * 0.82 + lane * 5.5);

        const ripple = Math.sin(t * 22 + phase) * (0.55 + lane * 2.1);
        const grain = (hashNoise(layer * 73.1 + step * 0.61) - 0.5) * (0.9 + lane * 2.4);

        const offset = base + lensLift + ripple + grain + drift * 0.08;
        const y = centerY + direction * offset * (direction === -1 ? 0.72 : 1);

        if (step === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
    };

    drawSide(-1);
    drawSide(1);
  }

  context.restore();
}

function drawDiskPlaneGlow(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  horizonRadius: number,
  time: number,
) {
  const spread = width * 0.46;

  context.save();
  context.filter = "blur(1.8px)";

  const lineGradient = context.createLinearGradient(centerX - spread, centerY, centerX + spread, centerY);
  lineGradient.addColorStop(0, "rgba(255,255,255,0)");
  lineGradient.addColorStop(0.2, "rgba(255,255,255,0.2)");
  lineGradient.addColorStop(0.48, "rgba(255,255,255,0.86)");
  lineGradient.addColorStop(0.52, "rgba(255,255,255,0.86)");
  lineGradient.addColorStop(0.8, "rgba(255,255,255,0.2)");
  lineGradient.addColorStop(1, "rgba(255,255,255,0)");

  context.fillStyle = lineGradient;
  context.fillRect(centerX - spread, centerY - 1.8, spread * 2, 3.6);

  const pulse = 0.9 + Math.sin(time * 0.9) * 0.08;
  context.fillStyle = `rgba(255,255,255,${(0.16 * pulse).toFixed(3)})`;
  context.fillRect(centerX - spread * 0.7, centerY - 8, spread * 1.4, 16);

  context.filter = "none";

  context.strokeStyle = "rgba(255,255,255,0.55)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(centerX, centerY, horizonRadius * 1.2, 0, TWO_PI);
  context.stroke();

  context.restore();
}

function drawPhotonRing(context: CanvasRenderingContext2D, centerX: number, centerY: number, horizonRadius: number, time: number) {
  context.save();
  context.translate(centerX, centerY);

  for (let i = 0; i < 5; i += 1) {
    const radiusX = horizonRadius * (1.18 + i * 0.08);
    const radiusY = horizonRadius * (0.86 + i * 0.05);
    const alpha = 0.42 - i * 0.065;

    context.strokeStyle = `rgba(255,255,255,${Math.max(alpha, 0.08).toFixed(3)})`;
    context.lineWidth = 1.35 + i * 0.2;
    context.setLineDash([9 + i * 2, 14 + i * 3]);
    context.lineDashOffset = -time * (9 + i * 3);
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, TWO_PI);
    context.stroke();
  }

  context.setLineDash([]);
  context.strokeStyle = "rgba(255,255,255,0.86)";
  context.lineWidth = 2.3;
  context.beginPath();
  context.arc(0, 0, horizonRadius * 1.01, 0, TWO_PI);
  context.stroke();

  context.restore();
}

function drawEventHorizon(context: CanvasRenderingContext2D, centerX: number, centerY: number, horizonRadius: number) {
  const darkAura = context.createRadialGradient(
    centerX,
    centerY,
    horizonRadius * 0.45,
    centerX,
    centerY,
    horizonRadius * 1.65,
  );
  darkAura.addColorStop(0, "rgba(0,0,0,1)");
  darkAura.addColorStop(0.7, "rgba(0,0,0,0.95)");
  darkAura.addColorStop(1, "rgba(0,0,0,0)");

  context.fillStyle = darkAura;
  context.beginPath();
  context.arc(centerX, centerY, horizonRadius * 1.66, 0, TWO_PI);
  context.fill();

  context.fillStyle = "#000";
  context.beginPath();
  context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
  context.fill();
}

function drawMicrolensingDot(context: CanvasRenderingContext2D, centerX: number, centerY: number, horizonRadius: number) {
  context.fillStyle = "rgba(0,0,0,0.96)";
  context.beginPath();
  context.arc(centerX + horizonRadius * 1.82, centerY + horizonRadius * 0.08, 2.2, 0, TWO_PI);
  context.fill();
}

export function AboutCosmosAnimation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let rafId = 0;
    let width = 0;
    let height = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);

    const render = (frame: number) => {
      const time = frame * 0.001;
      const centerX = width * 0.5;
      const centerY = height * 0.56 + Math.sin(time * 0.42) * 1.2;
      const horizonRadius = Math.min(width, height) * 0.112;

      drawBackground(context, width, height);
      drawSparseStars(context, width, height, time);
      drawAccretionWisps(context, width, centerX, centerY, horizonRadius, time);
      drawDiskPlaneGlow(context, centerX, centerY, width, horizonRadius, time);
      drawPhotonRing(context, centerX, centerY, horizonRadius, time);
      drawEventHorizon(context, centerX, centerY, horizonRadius);
      drawMicrolensingDot(context, centerX, centerY, horizonRadius);

      if (!reduceMotion) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={cn("relative h-[340px] w-full overflow-hidden rounded-none bg-black", className)}>
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_58%,transparent_40%,rgba(0,0,0,0.68)_100%)]" />
    </div>
  );
}
