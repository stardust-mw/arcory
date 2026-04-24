import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function extractThemeColor(html: string) {
  const metaTags = html.match(/<meta[^>]*>/gi) ?? [];
  let defaultColor = "";
  let lightColor = "";
  let darkColor = "";

  for (const tag of metaTags) {
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();
    if (name !== "theme-color") continue;

    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (!content) continue;

    const media = tag.match(/\bmedia\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase() ?? "";
    if (!media) {
      if (!defaultColor) defaultColor = content;
      continue;
    }
    if (media.includes("dark")) {
      if (!darkColor) darkColor = content;
      continue;
    }
    if (media.includes("light")) {
      if (!lightColor) lightColor = content;
    }
  }

  return darkColor || defaultColor || lightColor || "";
}

function extractManifestHref(html: string) {
  const links = html.match(/<link[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    if (!rel.includes("manifest")) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (href) return href;
  }
  return "";
}

function resolveUrl(baseUrl: string, maybeRelative: string) {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return "";
  }
}

function splitCspDirectives(csp: string) {
  return csp
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSourceAllowedForEmbed(source: string, targetOrigin: string, embedOrigin: string) {
  const normalized = source.trim().toLowerCase().replace(/^'+|'+$/g, "");
  if (!normalized) return false;
  if (normalized === "*") return true;
  if (normalized === "http:" || normalized === "https:") {
    return embedOrigin.startsWith(`${normalized}//`);
  }
  if (normalized === "self") return embedOrigin === targetOrigin;
  if (normalized === "none") return false;
  if (normalized.includes("*")) {
    const pattern = normalized
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`, "i").test(embedOrigin);
  }
  return embedOrigin === normalized;
}

function evaluateEmbedPolicy(
  targetUrl: string,
  embedOrigin: string,
  xFrameOptions: string,
  csp: string,
): { embeddable: boolean; blockedBy: string | null } {
  const targetOrigin = new URL(targetUrl).origin;
  const xfo = xFrameOptions.trim().toLowerCase();

  if (xfo.includes("deny")) {
    return { embeddable: false, blockedBy: "x-frame-options: deny" };
  }
  if (xfo.includes("sameorigin") && embedOrigin && embedOrigin !== targetOrigin) {
    return { embeddable: false, blockedBy: "x-frame-options: sameorigin" };
  }

  const directives = splitCspDirectives(csp);
  const frameAncestorsDirective = directives.find((item) => item.toLowerCase().startsWith("frame-ancestors"));
  if (!frameAncestorsDirective) {
    return { embeddable: true, blockedBy: null };
  }

  const parts = frameAncestorsDirective.split(/\s+/).slice(1);
  if (parts.length === 0) {
    return { embeddable: false, blockedBy: "csp: frame-ancestors" };
  }

  if (parts.some((source) => source.toLowerCase().replace(/^'+|'+$/g, "") === "none")) {
    return { embeddable: false, blockedBy: "csp: frame-ancestors 'none'" };
  }

  if (!embedOrigin) {
    return { embeddable: false, blockedBy: "csp: frame-ancestors (unknown embed origin)" };
  }

  const allowed = parts.some((source) => isSourceAllowedForEmbed(source, targetOrigin, embedOrigin));
  return allowed
    ? { embeddable: true, blockedBy: null }
    : { embeddable: false, blockedBy: "csp: frame-ancestors" };
}

function detectDarkHeuristic(html: string) {
  const content = html.toLowerCase();
  if (/data-theme\s*=\s*["']dark["']/.test(content)) return true;
  if (/class\s*=\s*["'][^"']*\bdark\b[^"']*["']/.test(content)) return true;
  if (
    /name\s*=\s*["']color-scheme["'][^>]+content\s*=\s*["'][^"']*dark/.test(content) ||
    /content\s*=\s*["'][^"']*dark[^"']*["'][^>]+name\s*=\s*["']color-scheme["']/.test(content)
  ) {
    return true;
  }
  if (
    /name\s*=\s*["']apple-mobile-web-app-status-bar-style["'][^>]+content\s*=\s*["'](?:black|black-translucent)["']/.test(
      content,
    )
  ) {
    return true;
  }
  return false;
}

function isLikelyDarkColor(value: string) {
  const color = value.trim().toLowerCase();
  const hex = color.replace(/^#/, "");
  if (hex.length === 3 || hex.length === 6) {
    const expand = (v: string) => (v.length === 1 ? v + v : v);
    const r = Number.parseInt(expand(hex.slice(0, hex.length === 3 ? 1 : 2)), 16);
    const g = Number.parseInt(expand(hex.slice(hex.length === 3 ? 1 : 2, hex.length === 3 ? 2 : 4)), 16);
    const b = Number.parseInt(expand(hex.slice(hex.length === 3 ? 2 : 4, hex.length === 3 ? 3 : 6)), 16);
    if ([r, g, b].some(Number.isNaN)) return false;
    const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
    return luminance < 0.45;
  }

  const rgb = color.match(/^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})/i);
  if (!rgb) return false;
  const r = Number.parseInt(rgb[1], 10);
  const g = Number.parseInt(rgb[2], 10);
  const b = Number.parseInt(rgb[3], 10);
  if ([r, g, b].some(Number.isNaN)) return false;
  const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return luminance < 0.45;
}

async function extractThemeFromManifest(pageUrl: string, html: string) {
  const manifestHref = extractManifestHref(html);
  if (!manifestHref) return { color: "", scheme: null as "dark" | "light" | null };

  const manifestUrl = resolveUrl(pageUrl, manifestHref);
  if (!manifestUrl) return { color: "", scheme: null as "dark" | "light" | null };

  try {
    const response = await fetch(manifestUrl, {
      headers: {
        "User-Agent": "arcory Preview Theme Bot/1.0",
      },
      cache: "no-store",
    });
    if (!response.ok) return { color: "", scheme: null as "dark" | "light" | null };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      return { color: "", scheme: null as "dark" | "light" | null };
    }

    const data = (await response.json()) as {
      theme_color?: string;
      background_color?: string;
    };
    const color = (data.theme_color ?? data.background_color ?? "").trim();
    const scheme: "dark" | "light" | null =
      /^#?0{3,8}$/i.test(color) || /^rgb\(\s*0[\s,]+0[\s,]+0/i.test(color)
        ? "dark"
        : color
          ? "light"
          : null;
    return { color, scheme };
  } catch {
    return { color: "", scheme: null as "dark" | "light" | null };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = normalizeUrl(searchParams.get("url") ?? "");
  const embedOrigin = normalizeOrigin(searchParams.get("embedOrigin") ?? "");
  if (!url) {
    return NextResponse.json({ themeColor: null, scheme: null, embeddable: false, blockedBy: "invalid-url" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "arcory Preview Theme Bot/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { themeColor: null },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return NextResponse.json(
        { themeColor: null },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const html = await response.text();
    const metaThemeColor = extractThemeColor(html);
    const manifestTheme = await extractThemeFromManifest(url, html);
    const themeColor = metaThemeColor || manifestTheme.color || null;
    const policy = evaluateEmbedPolicy(
      url,
      embedOrigin,
      response.headers.get("x-frame-options") ?? "",
      response.headers.get("content-security-policy") ?? "",
    );
    const scheme: "dark" | "light" | null = themeColor
      ? isLikelyDarkColor(themeColor)
        ? "dark"
        : "light"
      : detectDarkHeuristic(html)
        ? "dark"
        : manifestTheme.scheme === "dark"
          ? "dark"
          : manifestTheme.scheme === "light"
            ? "light"
            : null;

    return NextResponse.json(
      { themeColor, scheme, embeddable: policy.embeddable, blockedBy: policy.blockedBy },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { themeColor: null, scheme: null, embeddable: true, blockedBy: null },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
