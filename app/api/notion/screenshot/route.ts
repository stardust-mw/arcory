import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const SCREENSHOT_NAME_PATTERN = /(screenshot|screenshoot|preview|thumbnail|thumb|截图|预览)/i;
const CACHE_TTL_MS = Number.parseInt(process.env.NOTION_SCREENSHOT_PROXY_CACHE_MS ?? "", 10) || 30 * 60 * 1000;
const VALIDATE_INTERVAL_MS =
  Number.parseInt(process.env.NOTION_SCREENSHOT_PROXY_VALIDATE_MS ?? "", 10) || 60 * 1000;
const WEBP_MAX_WIDTH =
  Number.parseInt(process.env.NOTION_SCREENSHOT_PROXY_MAX_WIDTH ?? "", 10) || 640;
const WEBP_QUALITY =
  Number.parseInt(process.env.NOTION_SCREENSHOT_PROXY_WEBP_QUALITY ?? "", 10) || 48;
const WEBP_EFFORT =
  Number.parseInt(process.env.NOTION_SCREENSHOT_PROXY_WEBP_EFFORT ?? "", 10) || 6;
const DATA_DIR =
  process.env.ARCORY_DATA_DIR?.trim() || (process.env.VERCEL ? "/tmp/arcory-data" : path.join(process.cwd(), "data"));
const CACHE_DIR = path.join(DATA_DIR, "screenshot-cache");
const CACHE_INDEX_FILE = path.join(CACHE_DIR, "index.json");
const PUBLIC_CACHE_DIR = path.join(process.cwd(), "public", "screenshot-cache");

type NotionRichText = {
  plain_text?: string;
  href?: string | null;
  text?: {
    content?: string;
    link?: {
      url?: string | null;
    } | null;
  };
};

type NotionPropertyValue = {
  type?: string;
  url?: string | null;
  files?: Array<{
    type?: string;
    external?: { url?: string | null } | null;
    file?: { url?: string | null } | null;
  }>;
  rich_text?: NotionRichText[];
};

type NotionPageResponse = {
  properties?: Record<string, NotionPropertyValue>;
};

type CacheEntry = {
  pageId: string;
  fileName: string;
  sourceUrl: string;
  contentType: string;
  updatedAt: number;
  checkedAt: number;
};

type CacheIndex = Record<string, CacheEntry>;

const inflightCache = new Map<string, Promise<CacheEntry | null>>();
let cacheIndexLoaded = false;
let cacheIndex: CacheIndex = {};

function normalizeUrl(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return "";
  }
}

function extractUrlFromRichText(richText?: NotionRichText[]) {
  if (!Array.isArray(richText)) return "";
  for (const item of richText) {
    const href = normalizeUrl(item.href ?? "");
    if (href) return href;
    const link = normalizeUrl(item.text?.link?.url ?? "");
    if (link) return link;
    const raw = normalizeUrl(item.plain_text ?? item.text?.content ?? "");
    if (raw) return raw;
  }
  return "";
}

function extractScreenshotUrlFromProperty(value?: NotionPropertyValue) {
  if (!value) return "";
  if (value.type === "url") return normalizeUrl(value.url ?? "");
  if (value.type === "files") {
    const files = value.files ?? [];
    for (const file of files) {
      const external = normalizeUrl(file.external?.url ?? "");
      if (external) return external;
      const hosted = normalizeUrl(file.file?.url ?? "");
      if (hosted) return hosted;
    }
  }
  if (value.type === "rich_text") {
    return extractUrlFromRichText(value.rich_text);
  }
  return "";
}

async function fetchNotionPage(pageId: string, token: string) {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as NotionPageResponse;
}

function sanitizePageId(pageId: string) {
  return pageId.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

function toBlobFromBuffer(buffer: Buffer, contentType: string) {
  return new Blob([new Uint8Array(buffer)], { type: contentType });
}

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function loadCacheIndex() {
  if (cacheIndexLoaded) return cacheIndex;
  cacheIndexLoaded = true;

  try {
    await ensureCacheDir();
    const raw = await readFile(CACHE_INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheIndex;
    if (parsed && typeof parsed === "object") {
      cacheIndex = parsed;
    }
  } catch {
    cacheIndex = {};
  }

  return cacheIndex;
}

async function persistCacheIndex() {
  await ensureCacheDir();
  await writeFile(CACHE_INDEX_FILE, JSON.stringify(cacheIndex, null, 2), "utf8");
}

async function readCachedFile(entry: CacheEntry) {
  const filePath = path.join(CACHE_DIR, entry.fileName);
  try {
    await access(filePath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function readPublicCachedFile(pageId: string) {
  const fileName = `${sanitizePageId(pageId)}.webp`;
  const filePath = path.join(PUBLIC_CACHE_DIR, fileName);
  try {
    await access(filePath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function writeCachedFile(fileName: string, data: Buffer) {
  const filePath = path.join(CACHE_DIR, fileName);
  await ensureCacheDir();
  await writeFile(filePath, data);
}

async function resolveScreenshotUrl(pageId: string, token: string) {
  const page = await fetchNotionPage(pageId, token);
  if (!page?.properties) return "";

  for (const [name, value] of Object.entries(page.properties)) {
    if (!SCREENSHOT_NAME_PATTERN.test(name)) continue;
    const url = extractScreenshotUrlFromProperty(value);
    if (url) return url;
  }

  return "";
}

async function fetchAndCompressScreenshot(sourceUrl: string) {
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) return null;

  const compressed = await sharp(Buffer.from(arrayBuffer))
    .rotate()
    .resize({
      width: WEBP_MAX_WIDTH,
      withoutEnlargement: true,
      fit: "inside",
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: WEBP_EFFORT,
      smartSubsample: true,
      alphaQuality: 80,
    })
    .toBuffer();

  return {
    contentType: "image/webp",
    data: compressed,
  };
}

async function refreshCacheEntry(pageId: string, token: string) {
  const sourceUrl = await resolveScreenshotUrl(pageId, token);
  if (!sourceUrl) return null;

  const compressed = await fetchAndCompressScreenshot(sourceUrl);
  if (!compressed) return null;

  const fileName = `${sanitizePageId(pageId)}.webp`;
  await writeCachedFile(fileName, compressed.data);

  const now = Date.now();
  const entry: CacheEntry = {
    pageId,
    fileName,
    sourceUrl,
    contentType: compressed.contentType,
    updatedAt: now,
    checkedAt: now,
  };

  cacheIndex[pageId] = entry;
  await persistCacheIndex();
  return entry;
}

function shouldRevalidate(entry: CacheEntry) {
  const now = Date.now();
  const staleByCheck = now - entry.checkedAt > VALIDATE_INTERVAL_MS;
  const staleByAge = now - entry.updatedAt > CACHE_TTL_MS;
  return staleByCheck || staleByAge;
}

async function updateCheckedAt(pageId: string) {
  const current = cacheIndex[pageId];
  if (!current) return;
  current.checkedAt = Date.now();
  await persistCacheIndex();
}

function queueRevalidate(pageId: string, token: string, current: CacheEntry) {
  if (inflightCache.has(pageId)) return;

  const task = (async () => {
    try {
      const latestUrl = await resolveScreenshotUrl(pageId, token);
      if (!latestUrl) return null;

      if (latestUrl === current.sourceUrl) {
        await updateCheckedAt(pageId);
        return current;
      }

      return await refreshCacheEntry(pageId, token);
    } catch {
      return null;
    } finally {
      inflightCache.delete(pageId);
    }
  })();

  inflightCache.set(pageId, task);
}

async function getCachedEntry(pageId: string) {
  await loadCacheIndex();
  const cached = cacheIndex[pageId];
  if (!cached) return null;

  const file = await readCachedFile(cached);
  if (!file) {
    delete cacheIndex[pageId];
    await persistCacheIndex();
    return null;
  }
  return { entry: cached, file };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId")?.trim() ?? "";
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;

  if (!pageId) {
    return NextResponse.json({ error: "missing-page-id" }, { status: 400 });
  }

  const publicCachedFile = await readPublicCachedFile(pageId);
  if (publicCachedFile) {
    return new NextResponse(toBlobFromBuffer(publicCachedFile, "image/webp"), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Arcory-Cache": "HIT-PUBLIC",
      },
    });
  }

  if (!token) {
    return NextResponse.json({ error: "missing-notion-token" }, { status: 400 });
  }

  const cached = await getCachedEntry(pageId);
  if (cached) {
    if (shouldRevalidate(cached.entry)) {
      queueRevalidate(pageId, token, cached.entry);
    }

    return new NextResponse(toBlobFromBuffer(cached.file, cached.entry.contentType), {
      status: 200,
      headers: {
        "Content-Type": cached.entry.contentType,
        "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
        "X-Arcory-Cache": "HIT-DISK",
      },
    });
  }

  let inflight = inflightCache.get(pageId);
  if (!inflight) {
    inflight = refreshCacheEntry(pageId, token).finally(() => {
      inflightCache.delete(pageId);
    });
    inflightCache.set(pageId, inflight);
  }

  const loaded = await inflight;
  if (!loaded) {
    return NextResponse.json({ error: "screenshot-not-found" }, { status: 404 });
  }

  const file = await readCachedFile(loaded);
  if (!file) {
    return NextResponse.json({ error: "screenshot-cache-read-failed" }, { status: 500 });
  }

  return new NextResponse(toBlobFromBuffer(file, loaded.contentType), {
    status: 200,
    headers: {
      "Content-Type": loaded.contentType,
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
      "X-Arcory-Cache": "MISS-DISK",
    },
  });
}
