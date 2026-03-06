/**
 * Identicon 实现说明（中文）
 *
 * 1) 参考链接
 * - https://identicon-prototype.labs.vercel.dev/
 *
 * 2) 具体实现原理（本项目的封装方式）
 * - 输入 seed（如站点标题）后，先做双 32-bit 哈希（hashString），保证同 seed 恒定输出。
 * - 从哈希导出 hue（deriveHue），并通过 PRNG（mulberry32）生成稳定角度 angle。
 * - 用 angle 构造方向渐变强度 t：t = clamp(((x/size-0.5)*cos + (y/size-0.5)*sin) + 0.5)。
 * - 对每个像素使用 Bayer 阈值矩阵进行有序抖动二值化：
 *   - Bayer 2x2：4 阶阈值
 *   - Bayer 4x4：16 阶阈值
 * - 当 t > threshold 取 colorA，否则取 colorB，最终输出像素级 SVG（crispEdges）。
 *
 * 3) OKLCH Mono 解释
 * - Mono = Monochrome（单色系），核心是“同一 Hue，不同明度”。
 * - OKLCH 三要素：
 *   - L（Lightness）：明度，理论范围 0~1，控制亮/暗
 *     - L 越大越亮，越小越暗
 *     - 头像里常用区间：前景约 0.65~0.85，背景约 0.35~0.55（或反过来）
 *     - 前后景 L 差值越大，对比越强、识别度越高
 *   - C（Chroma）：色度，理论上 >= 0（受色域限制），控制饱和感
 *     - C=0 接近灰阶；C 越大颜色越“艳”
 *     - 常见安全区间：0.06~0.22（在 sRGB 下通常更稳定）
 *     - C 过低会发灰，C 过高在部分色相上可能裁剪/失真
 *   - H（Hue）：色相角，0~360
 * - 在 bayer-4x4-mono-oklch 中：
 *   - 前景/背景共用同一 hue
 *   - 通过 L 高低形成层次
 *   - C 控制整体“彩度强弱”（可通过 monoChroma 调整）
 */
const BAYER_2X2 = [
  [0, 2],
  [3, 1],
] as const;

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

export const IDENTICON_VARIANTS = [
  "bayer-2x2",
  "bayer-4x4",
  "bayer-4x4-prod-hsl-triadic",
  "bayer-4x4-mono-oklch",
] as const;

export type IdenticonVariant = (typeof IDENTICON_VARIANTS)[number];
export type IdenticonColorScheme = "oklch-mono" | "hsl-triadic";

export type IdenticonOptions = {
  variant?: IdenticonVariant;
  size?: number;
  colorScheme?: IdenticonColorScheme;
  monoChroma?: number;
  monoLightnessHigh?: number;
  monoLightnessLow?: number;
};

type RGB = [number, number, number];
type HashPair = [number, number];

function hashString(input: string): HashPair {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return [h1 >>> 0, h2 >>> 0];
}

function deriveHue(hash: HashPair) {
  const bytes: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    bytes.push((hash[0] >>> (i * 8)) & 0xff);
    bytes.push((hash[1] >>> (i * 8)) & 0xff);
  }

  return bytes.reduce((sum, value) => sum + value, 0) % 360;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;

  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let temp = Math.imul(value ^ (value >>> 15), 1 | value);
    temp = (temp + Math.imul(temp ^ (temp >>> 7), 61 | temp)) ^ temp;
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function hslToRgb(hue: number, saturation: number, lightness: number): RGB {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (index: number) => (index + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (index: number) => l - a * Math.max(-1, Math.min(k(index) - 3, 9 - k(index), 1));

  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function linearToSrgb(value: number) {
  if (value <= 0.0031308) return 12.92 * value;
  return 1.055 * value ** (1 / 2.4) - 0.055;
}

function oklchToRgb(lightness: number, chroma: number, hueDeg: number): RGB {
  const hRad = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hRad);
  const b = chroma * Math.sin(hRad);

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLinear = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return [
    Math.round(clamp01(linearToSrgb(rLinear)) * 255),
    Math.round(clamp01(linearToSrgb(gLinear)) * 255),
    Math.round(clamp01(linearToSrgb(bLinear)) * 255),
  ];
}

function rgbToCss(rgb: RGB) {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

function resolveColors(
  hash: HashPair,
  variant: IdenticonVariant,
  options: Required<Pick<IdenticonOptions, "colorScheme" | "monoChroma" | "monoLightnessHigh" | "monoLightnessLow">>,
): [RGB, RGB] {
  const hue = deriveHue(hash);

  if (variant === "bayer-4x4-prod-hsl-triadic") {
    return [hslToRgb(hue, 95, 50), hslToRgb((hue + 120) % 360, 95, 50)];
  }

  if (variant === "bayer-4x4-mono-oklch") {
    return [
      oklchToRgb(options.monoLightnessHigh, options.monoChroma, hue),
      oklchToRgb(options.monoLightnessLow, options.monoChroma, hue),
    ];
  }

  if (options.colorScheme === "hsl-triadic") {
    return [hslToRgb(hue, 95, 50), hslToRgb((hue + 120) % 360, 95, 50)];
  }

  return [
    oklchToRgb(options.monoLightnessHigh, options.monoChroma, hue),
    oklchToRgb(options.monoLightnessLow, options.monoChroma, hue),
  ];
}

function renderBayer(
  size: number,
  matrix: readonly (readonly number[])[],
  angle: number,
  colorA: RGB,
  colorB: RGB,
) {
  const matrixSize = matrix.length;
  const divisor = matrixSize * matrixSize;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const pixels: string[] = [];
  const colorAString = rgbToCss(colorA);
  const colorBString = rgbToCss(colorB);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = clamp01(
        ((x / size - 0.5) * cosA + (y / size - 0.5) * sinA) + 0.5,
      );
      const threshold = matrix[y % matrixSize][x % matrixSize] / divisor;
      const color = t > threshold ? colorAString : colorBString;
      pixels.push(`<rect x='${x}' y='${y}' width='1' height='1' fill='${color}' />`);
    }
  }

  return pixels.join("");
}

export function createIdenticonDataUrl(seed: string, options: IdenticonOptions = {}) {
  const variant = options.variant ?? "bayer-4x4-mono-oklch";
  const size = options.size ?? 32;
  const colorScheme = options.colorScheme ?? "oklch-mono";
  const monoChroma = options.monoChroma ?? 0.1;
  const monoLightnessHigh = options.monoLightnessHigh ?? 0.8;
  const monoLightnessLow = options.monoLightnessLow ?? 0.45;

  const hash = hashString(seed);
  const random = mulberry32(hash[0]);
  const angle = random() * Math.PI * 2;
  const [colorA, colorB] = resolveColors(hash, variant, {
    colorScheme,
    monoChroma,
    monoLightnessHigh,
    monoLightnessLow,
  });

  const matrix = variant === "bayer-2x2" ? BAYER_2X2 : BAYER_4X4;
  const pixelRects = renderBayer(size, matrix, angle, colorA, colorB);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' shape-rendering='crispEdges' viewBox='0 0 ${size} ${size}' width='${size}' height='${size}'>${pixelRects}</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 向后兼容旧调用
export function createBayerMonoIdenticon(seed: string) {
  return createIdenticonDataUrl(seed, { variant: "bayer-4x4-mono-oklch" });
}
