"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HeroAsciiGrid（动态 ASCII 背景）使用说明
 *
 * 1. 具体实现描述
 * - 网格固定为 20x11，每个格子渲染一个 ASCII 符号。
 * - 动画使用 requestAnimationFrame，以约 30fps 更新。
 * - 波场由 3 组正弦函数叠加生成，再映射到符号强度。
 *
 * 2. 动态效果如何更像“波”而不是“噪点”
 * - 对每个格子做 3x3 邻域平滑（中心权重更高，周边次之）。
 * - 先平滑后映射字符，能让相邻区域更连续，减少随机闪烁感。
 * - 仅保留很小的静态颗粒（grain）避免画面过于“糊”。
 *
 * 3. 低概率门控（以 # 为例）
 * - # 不走常规映射，仅在“高波峰 + 随机命中”时出现。
 * - 这样 # 的范围更小、频率更低，整体视觉更协调。
 *
 * 4. 可调参数（主要影响风格）
 * - WAVE_SCALE / WAVE_SPEED：控制波形尺度与运动速度。
 * - peakGate 的波峰阈值（value > 0.988）：越高，# 越少。
 * - peakGate 的随机门槛（hash > 0.89）：越高，# 触发频率越低。
 */
const GRID_COLS = 20;
const GRID_ROWS = 11;
const CELL_COUNT = GRID_COLS * GRID_ROWS;
const GRID_ROW_HEIGHT = 30;
const GRID_ROW_GAP = 1;
const FRAME_INTERVAL = 1000 / 30;
const WAVE_SCALE = 1;
const WAVE_SPEED = 1;
const BASE_ASCII_CHARS = ".:-+~/\\=";

type GlyphCell = {
  char: string;
  level: number;
};

const INITIAL_GLYPH_CELLS: GlyphCell[] = Array.from({ length: CELL_COUNT }, () => ({
  char: ".",
  level: 0.2,
}));

function hash2d(x: number, y: number) {
  const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return seed - Math.floor(seed);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function getWaveAt(col: number, row: number, timeSec: number) {
  const x = col / GRID_COLS;
  const y = row / GRID_ROWS;
  const phase = timeSec * WAVE_SPEED;

  // Same composite wave style as Polar, tuned for fixed 20x11 grid.
  const wave =
    (Math.sin((x + y) * Math.PI * WAVE_SCALE + phase) +
      0.5 * Math.sin(x * Math.PI * WAVE_SCALE * 1.5 - 0.7 * phase) +
      0.3 * Math.sin(y * Math.PI * WAVE_SCALE * 2 + 0.5 * phase)) /
    1.8;

  return clamp((wave + 1) / 2, 0, 1);
}

function getSmoothedWave(baseField: number[][], col: number, row: number) {
  let sum = 0;
  let weightSum = 0;

  for (let y = row - 1; y <= row + 1; y += 1) {
    if (y < 0 || y >= GRID_ROWS) continue;

    for (let x = col - 1; x <= col + 1; x += 1) {
      if (x < 0 || x >= GRID_COLS) continue;

      const isCenter = x === col && y === row;
      const isDiagonal = x !== col && y !== row;
      // 邻域平滑：中心 > 十字邻居 > 对角邻居，减少噪点感。
      const weight = isCenter ? 4 : isDiagonal ? 0.9 : 1.35;

      sum += baseField[y][x] * weight;
      weightSum += weight;
    }
  }

  return sum / weightSum;
}

function buildGlyphCells(timeSec: number) {
  const baseField: number[][] = Array.from({ length: GRID_ROWS }, () => Array<number>(GRID_COLS).fill(0));

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      baseField[row][col] = getWaveAt(col, row, timeSec);
    }
  }

  const cells: GlyphCell[] = new Array(CELL_COUNT);

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;
    const smoothed = getSmoothedWave(baseField, col, row);

    // Tiny static grain prevents overly flat bands while preserving coherence.
    const grain = (hash2d(col, row) - 0.5) * 0.06;
    const value = clamp(smoothstep(clamp(smoothed + grain, 0, 1)), 0, 1);
    const baseCharIndex = Math.min(
      BASE_ASCII_CHARS.length - 1,
      Math.floor(value * BASE_ASCII_CHARS.length),
    );
    // 低概率门控：# 仅在高波峰且随机命中时出现，避免大面积扩散。
    // 想再降低 #：提高 0.988 或提高 0.89。
    const peakGate = value > 0.988 && hash2d(col * 3.11, row * 5.17) > 0.89;
    const char = peakGate ? "#" : BASE_ASCII_CHARS[baseCharIndex];

    cells[index] = {
      char,
      level: value,
    };
  }

  return cells;
}

export function HeroAsciiGrid() {
  const [glyphCells, setGlyphCells] = useState<GlyphCell[]>(INITIAL_GLYPH_CELLS);
  const startedAtRef = useRef(0);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    let isActive = true;
    let frameId = 0;

    const tick = (timestamp: number) => {
      if (!isActive) return;

      if (!startedAtRef.current) {
        startedAtRef.current = timestamp;
      }

      const sinceLastFrame = timestamp - lastFrameRef.current;
      if (sinceLastFrame >= FRAME_INTERVAL) {
        lastFrameRef.current = timestamp - (sinceLastFrame % FRAME_INTERVAL);
        const elapsedSec = (timestamp - startedAtRef.current) / 1000;
        setGlyphCells(buildGlyphCells(elapsedSec));
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      isActive = false;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="relative h-[340px] w-full max-w-[640px]">
      <div className="absolute inset-0 m-0 overflow-hidden bg-card">
        <div className="grid h-full grid-cols-20 grid-rows-[repeat(11,30px)] gap-y-px">
          {glyphCells.map((cell, index) => (
            <div
              className="flex items-center justify-center text-[12px] font-medium leading-none text-foreground transition-[opacity] duration-100"
              key={index}
              style={{ opacity: 0.24 + cell.level * 0.68 }}
            >
              {cell.char}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="relative flex flex-col items-center justify-center gap-1 bg-white text-center"
          style={{
            width: "calc((100% / 20) * 12)",
            height: `${GRID_ROW_HEIGHT * 3 + GRID_ROW_GAP * 2}px`,
          }}
        >
          <p className="text-[14px] font-medium text-foreground">Collect. Explore. Create.</p>
          <p className="text-[12px] text-muted-foreground">Atlas</p>
        </div>
      </div>
    </div>
  );
}
