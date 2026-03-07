import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { categorySet, siteCategories, type SavedSite, type SiteCategory } from "@/lib/site-types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "notion-sites-cache.json");
const BACKUP_FILE = path.join(DATA_DIR, "notion-sites-backup.json");
const LOCK_FILE = path.join(DATA_DIR, "notion-classification-lock.json");
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const BACKUP_TARGET_HOURS = 3;
const BACKUP_RETENTION_DAYS = 14;
const SUBCATEGORY_TOKEN_MIN_WEIGHT = 8;
const SUBCATEGORY_TOKEN_MIN_DOCS = 2;
const SUBCATEGORY_TOKEN_MAX_PER_CATEGORY = 40;
const SUBCATEGORY_TOKEN_MIN_SCORE = 14;

type NotionRichText = {
  plain_text?: string;
  href?: string | null;
  type?: string;
  text?: {
    content?: string;
    link?: {
      url?: string | null;
    } | null;
  };
};

type NotionPropertyValue = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  url?: string | null;
  number?: number | null;
  select?: { name?: string | null } | null;
  multi_select?: Array<{ name?: string | null }>;
  checkbox?: boolean;
  status?: { name?: string | null } | null;
  formula?: {
    type?: string;
    string?: string | null;
  } | null;
};

type NotionPage = {
  id: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, NotionPropertyValue>;
};

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NormalizedNotionSite = {
  notionPageId: string;
  lastEditedTime: string;
  title: string;
  url: string;
  tags: string[];
  notes: string;
  clicks?: number;
  manualCategory?: string;
  manualSubcategory?: string;
  archived?: boolean;
};

type CachedNotionSite = SavedSite & {
  notionPageId: string;
  lastEditedTime: string;
  tags: string[];
  notes: string;
};

type NotionCacheFile = {
  syncedAt: string | null;
  sites: CachedNotionSite[];
};

type NotionBackupSnapshot = {
  slot: string;
  syncedAt: string;
  sites: CachedNotionSite[];
};

type NotionBackupFile = {
  snapshots: NotionBackupSnapshot[];
};

type LockedClassification = {
  category: SiteCategory;
  subcategory: string;
  lockedAt: string;
};

type ClassificationLockFile = {
  locked: boolean;
  lockedAt: string | null;
  items: Record<string, LockedClassification>;
};

type SiteWithCategory = {
  site: NormalizedNotionSite;
  category: SiteCategory;
};

type SubcategoryTokenStats = {
  weight: number;
  docs: number;
};

type SubcategoryModel = Record<SiteCategory, Map<string, SubcategoryTokenStats>>;

const DEFAULT_CACHE: NotionCacheFile = {
  syncedAt: null,
  sites: [],
};

const DEFAULT_BACKUP: NotionBackupFile = {
  snapshots: [],
};

const DEFAULT_CLASSIFICATION_LOCK: ClassificationLockFile = {
  locked: false,
  lockedAt: null,
  items: {},
};

const categoryKeywords: Record<SiteCategory, string[]> = {
  COMPONENTS: [
    "component",
    "ui",
    "radix",
    "shadcn",
    "react aria",
    "widget",
    "primitive",
    "组件",
  ],
  DESIGN: ["design", "figma", "icon", "palette", "typography", "视觉", "设计", "字体"],
  INSPIRATION: ["inspiration", "showcase", "gallery", "awwwards", "mobbin", "灵感", "案例"],
  KNOWLEDGE: ["docs", "documentation", "guide", "tutorial", "article", "blog", "知识", "文档", "教程"],
  PROJECT: ["project", "roadmap", "changelog", "repo", "github", "board", "kanban", "项目", "进度"],
  RESOURCES: ["resource", "tool", "playground", "api", "sdk", "template", "library", "工具", "资源"],
  SYSTEM: ["system", "architecture", "infra", "platform", "workflow", "pipeline", "架构", "系统"],
};

const URL_NAME_PATTERN = /(url|link|website|site|网址|链接)/i;
const TITLE_NAME_PATTERN = /(title|name|标题|名称)/i;
const SUBCATEGORY_NAME_PATTERN = /(subcategory|sub category|子分类)/i;
const CATEGORY_NAME_PATTERN = /(category|分类)/i;
const TAG_NAME_PATTERN = /(tag|label|标签)/i;
const NOTES_NAME_PATTERN = /(note|desc|description|memo|备注|说明)/i;
const CLICKS_NAME_PATTERN = /(click|visit|count|点击|访问)/i;
const URL_IN_TEXT_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i;
const WEAK_TITLE_TOKENS = new Set([
  "app",
  "ui",
  "web",
  "site",
  "home",
  "index",
  "docs",
  "blog",
  "chat",
  "tool",
  "tools",
  "dashboard",
  "portal",
  "login",
  "signup",
  "beta",
  "new",
]);

const TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "beta",
  "by",
  "co",
  "com",
  "dashboard",
  "dev",
  "docs",
  "for",
  "guide",
  "home",
  "index",
  "io",
  "new",
  "of",
  "on",
  "org",
  "site",
  "studio",
  "the",
  "to",
  "tool",
  "tools",
  "ui",
  "web",
  "www",
  "xyz",
]);

const SUBCATEGORY_SHORT_ALLOWLIST = new Set([
  "ai",
  "api",
  "ml",
  "ux",
  "ui",
  "llm",
  "2d",
  "3d",
]);

const SUBCATEGORY_GENERIC_TOKENS = new Set([
  "about",
  "ai",
  "all",
  "archive",
  "article",
  "awesome",
  "best",
  "blog",
  "book",
  "cloud",
  "collection",
  "course",
  "daily",
  "design",
  "free",
  "future",
  "general",
  "idea",
  "learn",
  "link",
  "links",
  "list",
  "news",
  "open",
  "page",
  "post",
  "prompt",
  "read",
  "resource",
  "resources",
  "site",
  "stack",
  "start",
  "system",
  "tech",
  "today",
  "top",
  "web",
  "work",
  "world",
]);

const subcategoryRuleMap: Array<{
  subcategory: string;
  keywords: string[];
}> = [
  {
    subcategory: "AI",
    keywords: ["ai", "llm", "gpt", "model", "prompt", "agent", "inference"],
  },
  {
    subcategory: "ICON",
    keywords: ["icon", "icons", "emoji", "glyph"],
  },
  {
    subcategory: "FONT",
    keywords: ["font", "fonts", "typography", "typeface"],
  },
  {
    subcategory: "COLOR",
    keywords: ["color", "colors", "palette", "gradient", "oklch"],
  },
  {
    subcategory: "MOTION",
    keywords: ["motion", "animation", "animate", "transition", "scroll"],
  },
  {
    subcategory: "COMPONENTS",
    keywords: ["component", "components", "radix", "shadcn", "tailwind ui", "ui kit"],
  },
  {
    subcategory: "DOCS",
    keywords: ["docs", "documentation", "guide", "handbook", "reference"],
  },
  {
    subcategory: "ARTICLE",
    keywords: ["article", "blog", "post", "newsletter"],
  },
  {
    subcategory: "TEMPLATE",
    keywords: ["template", "boilerplate", "starter", "kit"],
  },
  {
    subcategory: "PLAYGROUND",
    keywords: ["playground", "sandbox", "demo", "lab"],
  },
  {
    subcategory: "API",
    keywords: ["api", "sdk", "cli"],
  },
  {
    subcategory: "SHOWCASE",
    keywords: ["showcase", "gallery", "awwwards", "inspiration", "case study"],
  },
  {
    subcategory: "WORKFLOW",
    keywords: ["workflow", "automation", "pipeline", "infra", "architecture", "platform"],
  },
];

const websiteTitleCache = new Map<string, string>();
const ENABLE_TITLE_FETCH = process.env.NOTION_TITLE_FETCH === "1" || process.env.NOTION_TITLE_FETCH === "true";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCategory(value?: string | null): SiteCategory | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  const candidate = raw === "SYSTEMS" ? "SYSTEM" : raw;
  return categorySet.has(candidate as SiteCategory) ? (candidate as SiteCategory) : null;
}

function normalizeCachedSites(sites: unknown): CachedNotionSite[] {
  if (!Array.isArray(sites)) return [];

  const normalized: CachedNotionSite[] = [];
  for (const entry of sites) {
    if (!entry || typeof entry !== "object") continue;
    const site = entry as CachedNotionSite;
    const category = normalizeCategory(site.category) ?? "RESOURCES";
    const subcategory = normalizeSubcategoryForCategory(category, site.subcategory);
    normalized.push({
      ...site,
      category,
      subcategory,
    });
  }

  return dedupeCachedSitesByIdentity(normalized);
}

function richTextToString(richText?: NotionRichText[]) {
  if (!Array.isArray(richText)) return "";
  return richText.map((item) => item.plain_text ?? item.text?.content ?? "").join("").trim();
}

function pickPropertyByName(
  properties: Record<string, NotionPropertyValue>,
  type: string,
  namePattern: RegExp,
  options?: {
    excludeNamePattern?: RegExp;
  },
) {
  const named = Object.entries(properties).find(([name, value]) => {
    if (value.type !== type) return false;
    if (!namePattern.test(name)) return false;
    if (options?.excludeNamePattern?.test(name)) return false;
    return true;
  });
  if (named) return named;
  return (
    Object.entries(properties).find(([name, value]) => {
      if (value.type !== type) return false;
      if (options?.excludeNamePattern?.test(name)) return false;
      return true;
    }) ?? null
  );
}

function isLikelyUrl(value: string) {
  return URL_IN_TEXT_PATTERN.test(value.trim());
}

function normalizeUrl(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractUrlFromText(value?: string) {
  if (!value) return "";
  const matched = value.match(URL_IN_TEXT_PATTERN)?.[0];
  return normalizeUrl(matched ?? "");
}

function extractUrlFromRichText(richText?: NotionRichText[]) {
  if (!Array.isArray(richText)) return "";
  for (const item of richText) {
    const fromHref = normalizeUrl(item.href ?? "");
    if (fromHref) return fromHref;

    const fromLink = normalizeUrl(item.text?.link?.url ?? "");
    if (fromLink) return fromLink;

    const fromText = extractUrlFromText(item.plain_text ?? item.text?.content ?? "");
    if (fromText) return fromText;
  }
  return "";
}

function extractUrlFromPropertyValue(value?: NotionPropertyValue) {
  if (!value) return "";
  if (value.type === "url") return normalizeUrl(value.url ?? "");
  if (value.type === "title") return extractUrlFromRichText(value.title);
  if (value.type === "rich_text") return extractUrlFromRichText(value.rich_text);
  if (value.type === "formula") return extractUrlFromText(value.formula?.string ?? "");
  return "";
}

function extractTextFromPropertyValue(value?: NotionPropertyValue) {
  if (!value) return "";

  if (value.type === "status") return value.status?.name?.trim() ?? "";
  if (value.type === "select") return value.select?.name?.trim() ?? "";
  if (value.type === "multi_select") {
    return (value.multi_select ?? [])
      .map((item) => item.name?.trim())
      .filter((item): item is string => Boolean(item))
      .join(" ");
  }
  if (value.type === "title") return richTextToString(value.title);
  if (value.type === "rich_text") return richTextToString(value.rich_text);
  if (value.type === "formula") return value.formula?.string?.trim() ?? "";

  return "";
}

function cleanTitle(value?: string) {
  if (!value) return "";
  const normalized = decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (!normalized) return "";
  if (isLikelyUrl(normalized)) return "";
  return normalized;
}

function capitalizeWord(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tokenizeDomainLabel(label: string) {
  return label
    .split(/[-_]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function labelToTitle(label: string) {
  return tokenizeDomainLabel(label)
    .map((token) => capitalizeWord(token))
    .join(" ");
}

function getHostLabels(url: string) {
  try {
    const parts = new URL(url)
      .hostname.toLowerCase()
      .replace(/^www\./, "")
      .split(".")
      .filter(Boolean);
    const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
    const sub = parts.length > 2 ? parts[0] ?? "" : "";
    return { sub, core };
  } catch {
    return { sub: "", core: "" };
  }
}

function buildDistinctTitleFromUrl(url: string) {
  const { sub, core } = getHostLabels(url);
  if (!core) return "";

  const coreTitle = labelToTitle(core);
  if (!coreTitle) return "";

  const subTitle = sub ? labelToTitle(sub) : "";
  if (subTitle && subTitle.toLowerCase() !== coreTitle.toLowerCase()) {
    return `${subTitle} · ${coreTitle}`;
  }

  return coreTitle;
}

function isWeakTitle(title: string, url: string) {
  const normalized = cleanTitle(title).toLowerCase();
  if (!normalized) return true;

  if (WEAK_TITLE_TOKENS.has(normalized) || normalized.length <= 2) return true;

  const wordCount = normalized.split(/\s+/g).filter(Boolean).length;
  const { sub } = getHostLabels(url);
  if (wordCount === 1 && sub && normalized === sub) return true;

  return false;
}

function refineTitleByUrl(title: string, url: string) {
  const cleaned = cleanTitle(title);
  if (!cleaned) return "";

  if (!isWeakTitle(cleaned, url)) return cleaned;

  const distinct = buildDistinctTitleFromUrl(url);
  if (!distinct) return cleaned;

  return distinct;
}

function inferTitleFromDomain(url: string) {
  return buildDistinctTitleFromUrl(url);
}

function normalizeToken(token: string) {
  return token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatSubcategoryToken(token: string) {
  return normalizeToken(token).replace(/-/g, "_").toUpperCase();
}

function isValidSubcategoryToken(token: string) {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  if (TOKEN_STOPWORDS.has(normalized)) return false;
  if (SUBCATEGORY_GENERIC_TOKENS.has(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.length > 24) return false;
  if (normalized.split("-").length > 3) return false;
  if (normalized.length < 3 && !SUBCATEGORY_SHORT_ALLOWLIST.has(normalized)) return false;
  return true;
}

function tokenizeText(value: string) {
  return value
    .split(/[^a-z0-9]+/gi)
    .map((token) => normalizeToken(token))
    .filter((token) => isValidSubcategoryToken(token));
}

function getDomainTokens(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
    const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
    const sub = parts.length > 2 ? parts[0] ?? "" : "";
    const tokens = new Set<string>();
    for (const token of tokenizeDomainLabel(core)) {
      const normalized = normalizeToken(token);
      if (isValidSubcategoryToken(normalized)) tokens.add(normalized);
    }
    for (const token of tokenizeDomainLabel(sub)) {
      const normalized = normalizeToken(token);
      if (isValidSubcategoryToken(normalized)) tokens.add(normalized);
    }
    return Array.from(tokens);
  } catch {
    return [];
  }
}

function getPathTokens(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => normalizeToken(segment))
      .filter(Boolean);
    const first = segments[0];
    if (!isValidSubcategoryToken(first)) return [];
    return [first];
  } catch {
    return [];
  }
}

function getSiteTokenWeights(site: NormalizedNotionSite) {
  const weights = new Map<string, number>();
  const addWeight = (token: string, weight: number) => {
    const normalized = normalizeToken(token);
    if (!isValidSubcategoryToken(normalized)) return;
    weights.set(normalized, (weights.get(normalized) ?? 0) + weight);
  };

  for (const token of getDomainTokens(site.url)) addWeight(token, 6);
  for (const token of getPathTokens(site.url)) addWeight(token, 3);
  for (const tag of site.tags) {
    for (const token of tokenizeText(tag)) addWeight(token, 4);
  }
  for (const token of tokenizeText(site.title)) addWeight(token, 2);
  for (const token of tokenizeText(site.notes)) addWeight(token, 1);

  return weights;
}

function getFallbackSubcategory(site: NormalizedNotionSite) {
  for (const tag of site.tags) {
    const tokens = tokenizeText(tag);
    if (tokens.length > 0) {
      const token = formatSubcategoryToken(tokens[0]);
      if (token) return token;
    }
  }

  return "GENERAL";
}

function inferSubcategoryByRule(site: NormalizedNotionSite) {
  const content = normalizeText([site.title, site.url, site.tags.join(" "), site.notes].join(" "));
  for (const rule of subcategoryRuleMap) {
    const matched = rule.keywords.some((keyword) => content.includes(normalizeText(keyword)));
    if (matched) return rule.subcategory;
  }
  return "";
}

function decodeHtmlEntities(value: string) {
  const decodedNamed = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const decodeCodePoint = (codePoint: number, raw: string) => {
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return raw;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return raw;
    }
  };

  const decodedHex = decodedNamed.replace(/&#x([0-9a-fA-F]+);/g, (raw, hex) =>
    decodeCodePoint(parseInt(hex, 16), raw),
  );

  return decodedHex.replace(/&#([0-9]+);/g, (raw, decimal) => decodeCodePoint(parseInt(decimal, 10), raw));
}

function extractTitleFromHtml(html: string) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["'][^>]*>/i,
  ];

  for (const pattern of metaPatterns) {
    const matched = html.match(pattern)?.[1];
    const cleaned = cleanTitle(decodeHtmlEntities(matched ?? ""));
    if (cleaned) return cleaned;
  }

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const cleanedTitle = cleanTitle(decodeHtmlEntities(titleTag ?? ""));
  if (cleanedTitle) return cleanedTitle;

  return "";
}

async function fetchWebsiteTitle(url: string) {
  if (websiteTitleCache.has(url)) {
    return websiteTitleCache.get(url) ?? "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Arcory Notion Sync Bot/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) return "";

    const html = await response.text();
    const title = extractTitleFromHtml(html);
    if (title) {
      websiteTitleCache.set(url, title);
      return title;
    }

    return "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function pickFirstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const cleaned = cleanTitle(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function extractUrlFromProperties(properties: Record<string, NotionPropertyValue>) {
  const priorityCandidates = Object.entries(properties)
    .filter(([name]) => URL_NAME_PATTERN.test(name))
    .map(([, value]) => value);

  for (const value of priorityCandidates) {
    const resolved = extractUrlFromPropertyValue(value);
    if (resolved) return resolved;
  }

  for (const [, value] of Object.entries(properties)) {
    const resolved = extractUrlFromPropertyValue(value);
    if (resolved) return resolved;
  }

  return "";
}

function extractTitleFromProperties(properties: Record<string, NotionPropertyValue>) {
  const namedTitleEntry = pickPropertyByName(properties, "title", TITLE_NAME_PATTERN);
  const anyTitleEntry = pickPropertyByName(properties, "title", /.*/i);
  const namedRichTitleEntry = pickPropertyByName(properties, "rich_text", TITLE_NAME_PATTERN);

  return pickFirstNonEmpty(
    namedTitleEntry ? richTextToString(namedTitleEntry[1].title) : "",
    anyTitleEntry ? richTextToString(anyTitleEntry[1].title) : "",
    namedRichTitleEntry ? richTextToString(namedRichTitleEntry[1].rich_text) : "",
  );
}

async function resolveSiteTitle(site: NormalizedNotionSite, oldTitle?: string) {
  const existing = cleanTitle(site.title);
  if (existing) return refineTitleByUrl(existing, site.url);

  const previous = cleanTitle(oldTitle);
  if (previous) return refineTitleByUrl(previous, site.url);

  if (ENABLE_TITLE_FETCH) {
    const fetched = await fetchWebsiteTitle(site.url);
    if (fetched) return refineTitleByUrl(fetched, site.url);
  }

  const inferred = refineTitleByUrl(inferTitleFromDomain(site.url), site.url);
  if (inferred) return inferred;

  return "Untitled Site";
}

function extractSiteFromPage(page: NotionPage): NormalizedNotionSite | null {
  const properties = page.properties;
  if (!properties) return null;

  const titleEntry = pickPropertyByName(properties, "title", TITLE_NAME_PATTERN);
  const tagsEntry = pickPropertyByName(properties, "multi_select", TAG_NAME_PATTERN);
  const notesEntry = pickPropertyByName(properties, "rich_text", NOTES_NAME_PATTERN);
  const clicksEntry = pickPropertyByName(properties, "number", CLICKS_NAME_PATTERN);
  const categoryEntry =
    pickPropertyByName(properties, "select", CATEGORY_NAME_PATTERN, {
      excludeNamePattern: SUBCATEGORY_NAME_PATTERN,
    }) ??
    pickPropertyByName(properties, "status", CATEGORY_NAME_PATTERN, {
      excludeNamePattern: SUBCATEGORY_NAME_PATTERN,
    });
  const categoryTextEntry =
    pickPropertyByName(properties, "rich_text", CATEGORY_NAME_PATTERN, {
      excludeNamePattern: SUBCATEGORY_NAME_PATTERN,
    }) ??
    pickPropertyByName(properties, "title", CATEGORY_NAME_PATTERN, {
      excludeNamePattern: SUBCATEGORY_NAME_PATTERN,
    }) ??
    pickPropertyByName(properties, "multi_select", CATEGORY_NAME_PATTERN, {
      excludeNamePattern: SUBCATEGORY_NAME_PATTERN,
    });
  const subcategoryEntry =
    pickPropertyByName(properties, "select", SUBCATEGORY_NAME_PATTERN) ??
    pickPropertyByName(properties, "status", SUBCATEGORY_NAME_PATTERN);
  const subcategoryTextEntry =
    pickPropertyByName(properties, "rich_text", SUBCATEGORY_NAME_PATTERN) ??
    pickPropertyByName(properties, "title", SUBCATEGORY_NAME_PATTERN) ??
    pickPropertyByName(properties, "multi_select", SUBCATEGORY_NAME_PATTERN);

  const extractedTitle = titleEntry ? richTextToString(titleEntry[1].title) : "";
  const title = pickFirstNonEmpty(extractedTitle, extractTitleFromProperties(properties));
  const url = extractUrlFromProperties(properties);
  const tags = (tagsEntry?.[1].multi_select ?? [])
    .map((tag) => tag.name?.trim())
    .filter((tag): tag is string => Boolean(tag));
  const notes = notesEntry ? richTextToString(notesEntry[1].rich_text) : "";
  const clicks = clicksEntry?.[1].number ?? undefined;
  const manualCategory = pickFirstNonEmpty(
    categoryEntry ? extractTextFromPropertyValue(categoryEntry[1]) : "",
    categoryTextEntry ? extractTextFromPropertyValue(categoryTextEntry[1]) : "",
  );
  const manualSubcategory = pickFirstNonEmpty(
    subcategoryEntry ? extractTextFromPropertyValue(subcategoryEntry[1]) : "",
    subcategoryTextEntry ? extractTextFromPropertyValue(subcategoryTextEntry[1]) : "",
  );

  if (!url) return null;

  return {
    notionPageId: page.id,
    lastEditedTime: page.last_edited_time ?? new Date().toISOString(),
    title,
    url,
    tags,
    notes,
    clicks: typeof clicks === "number" ? clicks : undefined,
    manualCategory: manualCategory || undefined,
    manualSubcategory: manualSubcategory || undefined,
    archived: Boolean(page.archived || page.in_trash),
  };
}

function extractDomain(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const withoutWww = hostname.replace(/^www\./, "");
    return withoutWww;
  } catch {
    return "";
  }
}

function getTimestampValue(value?: string) {
  const ts = Date.parse(value ?? "");
  return Number.isFinite(ts) ? ts : 0;
}

function getSiteQualityScore(site: NormalizedNotionSite) {
  let score = 0;

  if (cleanTitle(site.title)) score += 2;
  if (site.manualCategory) score += 2;
  if (site.manualSubcategory) score += 1;
  if (site.tags.length > 0) score += Math.min(site.tags.length, 3);
  if (site.notes.trim()) score += 1;
  if (typeof site.clicks === "number" && site.clicks > 0) score += 1;

  return score;
}

function buildUrlDedupKey(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    const search = parsed.search || "";
    return `${host}${pathname}${search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function pickPreferredSiteByUrl(a: NormalizedNotionSite, b: NormalizedNotionSite) {
  const timeA = getTimestampValue(a.lastEditedTime);
  const timeB = getTimestampValue(b.lastEditedTime);
  if (timeA !== timeB) return timeB > timeA ? b : a;

  const qualityA = getSiteQualityScore(a);
  const qualityB = getSiteQualityScore(b);
  if (qualityA !== qualityB) return qualityB > qualityA ? b : a;

  return b.notionPageId.localeCompare(a.notionPageId) > 0 ? b : a;
}

function dedupeSitesByUrl(sites: NormalizedNotionSite[]) {
  const deduped = new Map<string, NormalizedNotionSite>();

  for (const site of sites) {
    const key = buildUrlDedupKey(site.url);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, site);
      continue;
    }

    deduped.set(key, pickPreferredSiteByUrl(current, site));
  }

  return Array.from(deduped.values());
}

function normalizeTitleForSiteIdentity(value: string) {
  return cleanTitle(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function getPathDepth(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function buildCachedSiteIdentityKey(site: CachedNotionSite) {
  const category = normalizeCategory(site.category) ?? "RESOURCES";
  const safeUrl = site.url ?? "";
  const host = extractDomain(safeUrl);
  const title = normalizeTitleForSiteIdentity(site.title);

  // Fall back to URL-based key when host/title is weak to avoid over-merging.
  if (!host || !title) {
    return `${buildUrlDedupKey(safeUrl)}::${category}`;
  }

  return `${host}::${title}::${category}`;
}

function pickPreferredCachedSite(a: CachedNotionSite, b: CachedNotionSite) {
  if (a.clicks !== b.clicks) return b.clicks > a.clicks ? b : a;

  const timeA = getTimestampValue(a.lastEditedTime);
  const timeB = getTimestampValue(b.lastEditedTime);
  if (timeA !== timeB) return timeB > timeA ? b : a;

  const pathDepthA = getPathDepth(a.url ?? "");
  const pathDepthB = getPathDepth(b.url ?? "");
  if (pathDepthA !== pathDepthB) return pathDepthA < pathDepthB ? a : b;

  return b.notionPageId.localeCompare(a.notionPageId) > 0 ? b : a;
}

function dedupeCachedSitesByIdentity(sites: CachedNotionSite[]) {
  const deduped = new Map<string, CachedNotionSite>();

  for (const site of sites) {
    const key = buildCachedSiteIdentityKey(site);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, site);
      continue;
    }

    deduped.set(key, pickPreferredCachedSite(current, site));
  }

  return Array.from(deduped.values());
}

function normalizeManualSubcategory(value?: string) {
  const token = formatSubcategoryToken(value ?? "");
  return token || "";
}

function normalizeSubcategoryForCategory(category: SiteCategory, subcategory?: string | null) {
  const normalized = normalizeManualSubcategory(subcategory ?? "");
  if (!normalized) return "GENERAL";
  if (normalized === category) return "GENERAL";
  return normalized;
}

function buildSubcategoryModel(sitesWithCategory: SiteWithCategory[]): SubcategoryModel {
  const model = Object.fromEntries(
    siteCategories.map((category) => [category, new Map<string, SubcategoryTokenStats>()]),
  ) as SubcategoryModel;

  for (const { site, category } of sitesWithCategory) {
    const tokenWeights = getSiteTokenWeights(site);
    const bucket = model[category];
    for (const [token, weight] of tokenWeights.entries()) {
      const previous = bucket.get(token) ?? { weight: 0, docs: 0 };
      bucket.set(token, {
        weight: previous.weight + weight,
        docs: previous.docs + 1,
      });
    }
  }

  for (const category of siteCategories) {
    const bucket = model[category];
    const pruned = Array.from(bucket.entries())
      .filter(([, stats]) => stats.docs >= SUBCATEGORY_TOKEN_MIN_DOCS && stats.weight >= SUBCATEGORY_TOKEN_MIN_WEIGHT)
      .sort((a, b) => b[1].weight - a[1].weight || b[1].docs - a[1].docs)
      .slice(0, SUBCATEGORY_TOKEN_MAX_PER_CATEGORY);

    model[category] = new Map(pruned);
  }

  return model;
}

function inferSubcategoryByModel(site: NormalizedNotionSite, category: SiteCategory, model: SubcategoryModel) {
  const manual = normalizeManualSubcategory(site.manualSubcategory);
  if (manual) return manual;

  const ruleBased = inferSubcategoryByRule(site);
  if (ruleBased) return ruleBased;

  const tokenWeights = getSiteTokenWeights(site);
  const bucket = model[category];
  if (bucket && bucket.size > 0) {
    let bestToken = "";
    let bestScore = -1;
    for (const [token, tokenWeight] of tokenWeights.entries()) {
      const stats = bucket.get(token);
      if (!stats) continue;

      const score = tokenWeight * 3 + stats.weight + stats.docs * 5;
      if (score > bestScore) {
        bestScore = score;
        bestToken = token;
      }
    }

    if (bestToken && bestScore >= SUBCATEGORY_TOKEN_MIN_SCORE) {
      const formatted = formatSubcategoryToken(bestToken);
      if (formatted) return formatted;
    }
  }

  return getFallbackSubcategory(site);
}

function inferMeta(site: NormalizedNotionSite, category: SiteCategory) {
  if (site.tags.length > 0) {
    return site.tags
      .slice(0, 2)
      .map((tag) => normalizeText(tag))
      .join("•");
  }

  const domain = extractDomain(site.url);
  const domainToken = domain ? domain.split(".")[0] : "web";
  return `${domainToken}•${normalizeText(category)}`;
}

function inferCategoryByRule(site: NormalizedNotionSite): SiteCategory {
  const manual = normalizeCategory(site.manualCategory);
  if (manual) return manual;

  const content = normalizeText([site.title, site.url, site.tags.join(" "), site.notes].join(" "));
  for (const category of siteCategories) {
    const matched = categoryKeywords[category].some((keyword) => content.includes(normalizeText(keyword)));
    if (matched) return category;
  }

  return "RESOURCES";
}

async function inferCategoryByAI(site: NormalizedNotionSite): Promise<SiteCategory | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = {
    title: site.title,
    url: site.url,
    tags: site.tags,
    notes: site.notes,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CLASSIFIER_MODEL ?? "gpt-4.1-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a strict classifier. Return JSON with one field: category. category must be one of COMPONENTS, DESIGN, INSPIRATION, KNOWLEDGE, PROJECT, RESOURCES, SYSTEM.",
          },
          {
            role: "user",
            content: JSON.stringify(prompt),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { category?: string };
    return normalizeCategory(parsed.category);
  } catch {
    return null;
  }
}

async function classifySiteCategory(site: NormalizedNotionSite) {
  const manual = normalizeCategory(site.manualCategory);
  const aiCategory = manual ? null : await inferCategoryByAI(site);
  return manual ?? aiCategory ?? inferCategoryByRule(site);
}

function applyClassificationStrategy(
  site: NormalizedNotionSite,
  autoCategory: SiteCategory,
  autoSubcategory: string,
  lockFile: ClassificationLockFile,
  nowIso: string,
  pendingLockUpdates: Record<string, LockedClassification>,
) {
  const manualCategory = normalizeCategory(site.manualCategory);
  const manualSubcategory = normalizeManualSubcategory(site.manualSubcategory);
  const urlKey = buildUrlDedupKey(site.url);

  if (manualCategory || manualSubcategory) {
    const category = manualCategory ?? autoCategory;
    const subcategory = normalizeSubcategoryForCategory(category, manualSubcategory || autoSubcategory);

    if (lockFile.locked) {
      pendingLockUpdates[urlKey] = {
        category,
        subcategory,
        lockedAt: nowIso,
      };
    }

    return { category, subcategory };
  }

  if (lockFile.locked) {
    const locked = lockFile.items[urlKey];
    if (locked) {
      const category = normalizeCategory(locked.category) ?? autoCategory;
      return {
        category,
        subcategory: normalizeSubcategoryForCategory(category, locked.subcategory),
      };
    }

    pendingLockUpdates[urlKey] = {
      category: autoCategory,
      subcategory: normalizeSubcategoryForCategory(autoCategory, autoSubcategory),
      lockedAt: nowIso,
    };
  }

  return {
    category: autoCategory,
    subcategory: normalizeSubcategoryForCategory(autoCategory, autoSubcategory),
  };
}

function isSiteContentEqual(oldSite: CachedNotionSite, nextSite: CachedNotionSite) {
  return (
    oldSite.title === nextSite.title &&
    oldSite.url === nextSite.url &&
    oldSite.category === nextSite.category &&
    oldSite.subcategory === nextSite.subcategory &&
    oldSite.meta === nextSite.meta &&
    oldSite.clicks === nextSite.clicks &&
    oldSite.lastEditedTime === nextSite.lastEditedTime &&
    oldSite.notes === nextSite.notes &&
    oldSite.tags.join("||") === nextSite.tags.join("||")
  );
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readCacheFile(): Promise<NotionCacheFile> {
  try {
    const content = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(content) as NotionCacheFile;
    if (!parsed) return DEFAULT_CACHE;
    return {
      syncedAt: parsed.syncedAt ?? null,
      sites: normalizeCachedSites(parsed.sites),
    };
  } catch {
    return DEFAULT_CACHE;
  }
}

async function writeCacheFile(cache: NotionCacheFile) {
  await ensureDataDir();
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function readBackupFile(): Promise<NotionBackupFile> {
  try {
    const content = await readFile(BACKUP_FILE, "utf8");
    const parsed = JSON.parse(content) as NotionBackupFile;
    if (!parsed || !Array.isArray(parsed.snapshots)) return DEFAULT_BACKUP;

    const snapshots = parsed.snapshots
      .filter((snapshot) => {
        if (!snapshot || typeof snapshot.syncedAt !== "string") return false;
        if (!Array.isArray(snapshot.sites)) return false;
        if (typeof snapshot.slot !== "string" || snapshot.slot.length === 0) return false;
        return true;
      })
      .map((snapshot) => ({
        ...snapshot,
        sites: normalizeCachedSites(snapshot.sites),
      }));

    return { snapshots };
  } catch {
    return DEFAULT_BACKUP;
  }
}

async function writeBackupFile(backup: NotionBackupFile) {
  await ensureDataDir();
  await writeFile(BACKUP_FILE, JSON.stringify(backup, null, 2), "utf8");
}

function getBackupSlot(isoTime: string) {
  return isoTime.slice(0, 13);
}

function compareSnapshotsDesc(a: NotionBackupSnapshot, b: NotionBackupSnapshot) {
  return new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime();
}

async function writeBackupSnapshot(cache: NotionCacheFile) {
  if (!cache.syncedAt || cache.sites.length === 0) return;

  const backup = await readBackupFile();
  const snapshot: NotionBackupSnapshot = {
    slot: getBackupSlot(cache.syncedAt),
    syncedAt: cache.syncedAt,
    sites: cache.sites,
  };

  const nextSnapshots = backup.snapshots.filter((item) => item.slot !== snapshot.slot);
  nextSnapshots.push(snapshot);

  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned = nextSnapshots
    .filter((item) => new Date(item.syncedAt).getTime() >= cutoff)
    .sort(compareSnapshotsDesc);

  await writeBackupFile({ snapshots: pruned });
}

async function readClassificationLockFile(): Promise<ClassificationLockFile> {
  try {
    const content = await readFile(LOCK_FILE, "utf8");
    const parsed = JSON.parse(content) as ClassificationLockFile;
    if (!parsed || typeof parsed !== "object") return DEFAULT_CLASSIFICATION_LOCK;
    if (typeof parsed.locked !== "boolean") return DEFAULT_CLASSIFICATION_LOCK;
    if (parsed.lockedAt !== null && typeof parsed.lockedAt !== "string") return DEFAULT_CLASSIFICATION_LOCK;
    if (!parsed.items || typeof parsed.items !== "object") return DEFAULT_CLASSIFICATION_LOCK;

    const safeItems: Record<string, LockedClassification> = {};
    for (const [urlKey, value] of Object.entries(parsed.items)) {
      if (!value || typeof value !== "object") continue;
      const category = normalizeCategory((value as LockedClassification).category);
      const subcategory = category
        ? normalizeSubcategoryForCategory(category, (value as LockedClassification).subcategory)
        : "";
      const lockedAt =
        typeof (value as LockedClassification).lockedAt === "string" ? (value as LockedClassification).lockedAt : "";
      if (!category || !subcategory || !lockedAt) continue;
      safeItems[urlKey] = {
        category,
        subcategory,
        lockedAt,
      };
    }

    return {
      locked: parsed.locked,
      lockedAt: parsed.lockedAt ?? null,
      items: safeItems,
    };
  } catch {
    return DEFAULT_CLASSIFICATION_LOCK;
  }
}

async function writeClassificationLockFile(lockFile: ClassificationLockFile) {
  await ensureDataDir();
  await writeFile(LOCK_FILE, JSON.stringify(lockFile, null, 2), "utf8");
}

function mapCachedSitesToClientSites(sites: CachedNotionSite[]) {
  return sites.map((site) => ({
    category: normalizeCategory(site.category) ?? "RESOURCES",
    subcategory: normalizeSubcategoryForCategory(normalizeCategory(site.category) ?? "RESOURCES", site.subcategory),
    id: site.id,
    title: site.title,
    meta: site.meta,
    clicks: site.clicks,
    url: site.url,
    source: site.source,
    updatedAt: site.updatedAt,
  }));
}

function buildClassificationSummary(sites: CachedNotionSite[]) {
  const byCategory = Object.fromEntries(
    siteCategories.map((category) => [
      category,
      {
        count: 0,
        subcategoryCounts: new Map<string, number>(),
      },
    ]),
  ) as Record<
    SiteCategory,
    {
      count: number;
      subcategoryCounts: Map<string, number>;
    }
  >;

  for (const site of sites) {
    const category = normalizeCategory(site.category) ?? "RESOURCES";
    const bucket = byCategory[category];
    bucket.count += 1;

    const normalizedSubcategory = normalizeSubcategoryForCategory(category, site.subcategory);
    bucket.subcategoryCounts.set(normalizedSubcategory, (bucket.subcategoryCounts.get(normalizedSubcategory) ?? 0) + 1);
  }

  return siteCategories.map((category) => {
    const bucket = byCategory[category];
    const subcategories = Array.from(bucket.subcategoryCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
      .map(([name, count]) => ({ name, count }));

    return {
      category,
      count: bucket.count,
      subcategories,
    };
  });
}

async function getFallbackSitesFromBackupOrCache() {
  const backup = await readBackupFile();
  const snapshots = [...backup.snapshots].sort(compareSnapshotsDesc);
  const targetTime = Date.now() - BACKUP_TARGET_HOURS * 60 * 60 * 1000;
  const backupAtTarget = snapshots.find((item) => new Date(item.syncedAt).getTime() <= targetTime);

  if (backupAtTarget && backupAtTarget.sites.length > 0) {
    return {
      sites: mapCachedSitesToClientSites(backupAtTarget.sites),
      source: "notion" as const,
      syncedAt: backupAtTarget.syncedAt,
      fallback: "backup-3h" as const,
    };
  }

  if (snapshots[0] && snapshots[0].sites.length > 0) {
    return {
      sites: mapCachedSitesToClientSites(snapshots[0].sites),
      source: "notion" as const,
      syncedAt: snapshots[0].syncedAt,
      fallback: "backup-latest" as const,
    };
  }

  const cache = await readCacheFile();
  if (cache.sites.length > 0) {
    if (snapshots.length === 0) {
      try {
        await writeBackupSnapshot(cache);
      } catch {
        // Ignore backup bootstrap errors.
      }
    }

    return {
      sites: mapCachedSitesToClientSites(cache.sites),
      source: "notion" as const,
      syncedAt: cache.syncedAt,
      fallback: "cache-latest" as const,
    };
  }

  return {
    sites: [],
    source: "unavailable" as const,
    syncedAt: null,
    fallback: "empty" as const,
  };
}

function hasNotionConfig() {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

async function queryNotionDatabaseAll(): Promise<NotionPage[]> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token || !databaseId) return [];

  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  while (true) {
    const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion query failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as NotionQueryResponse;
    if (Array.isArray(data.results)) pages.push(...data.results);

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return pages;
}

type SyncNotionOptions =
  | boolean
  | {
      force?: boolean;
      reclassify?: boolean;
    };

export async function syncNotionSites(options: SyncNotionOptions = false) {
  const force = typeof options === "boolean" ? options : Boolean(options.force);
  const reclassify = typeof options === "boolean" ? false : Boolean(options.reclassify);

  const cache = await readCacheFile();
  const oldById = new Map(cache.sites.map((site) => [site.notionPageId, site]));
  const now = new Date();
  const shouldSync =
    force ||
    !cache.syncedAt ||
    now.getTime() - new Date(cache.syncedAt).getTime() > AUTO_SYNC_INTERVAL_MS;

  if (!shouldSync) {
    return {
      synced: false,
      reason: "fresh-cache" as const,
      cache,
    };
  }

  if (!hasNotionConfig()) {
    return {
      synced: false,
      reason: "missing-config" as const,
      cache,
    };
  }

  const notionPages = await queryNotionDatabaseAll();
  const normalized = notionPages.map(extractSiteFromPage).filter((site): site is NormalizedNotionSite => Boolean(site));
  const currentActive = dedupeSitesByUrl(normalized.filter((site) => !site.archived));
  const lockFile = await readClassificationLockFile();
  const pendingLockUpdates: Record<string, LockedClassification> = { ...lockFile.items };

  const nextSites: CachedNotionSite[] = [];
  let created = 0;
  let updated = 0;
  const nowIso = now.toISOString();
  const preparedSites: Array<{ site: NormalizedNotionSite; old?: CachedNotionSite; autoCategory: SiteCategory }> = [];

  for (const site of currentActive) {
    const old = oldById.get(site.notionPageId);
    const unchangedByNotion = Boolean(old && old.lastEditedTime === site.lastEditedTime);
    const resolvedTitle = old && unchangedByNotion && !reclassify ? old.title : await resolveSiteTitle(site, old?.title);
    const normalizedSite = {
      ...site,
      title: resolvedTitle,
    };
    const preservedOldCategory = normalizeCategory(old?.category);
    const autoCategory =
      old && unchangedByNotion && !reclassify && preservedOldCategory
        ? preservedOldCategory
        : await classifySiteCategory(normalizedSite);
    preparedSites.push({
      site: normalizedSite,
      old,
      autoCategory,
    });
  }

  const subcategoryModel = buildSubcategoryModel(
    preparedSites.map((item) => ({
      site: item.site,
      category: item.autoCategory,
    })),
  );

  for (const item of preparedSites) {
    const autoSubcategory = inferSubcategoryByModel(item.site, item.autoCategory, subcategoryModel);
    const finalClassification = applyClassificationStrategy(
      item.site,
      item.autoCategory,
      autoSubcategory,
      lockFile,
      nowIso,
      pendingLockUpdates,
    );
    const nextSite: CachedNotionSite = {
      id: item.site.notionPageId,
      notionPageId: item.site.notionPageId,
      title: item.site.title,
      url: item.site.url,
      tags: item.site.tags,
      notes: item.site.notes,
      clicks: item.site.clicks ?? item.old?.clicks ?? 0,
      category: finalClassification.category,
      subcategory: finalClassification.subcategory,
      meta: inferMeta(item.site, finalClassification.category),
      lastEditedTime: item.site.lastEditedTime,
      source: "notion",
      updatedAt: nowIso,
    };

    if (!item.old) {
      created += 1;
      nextSites.push(nextSite);
      continue;
    }

    if (isSiteContentEqual(item.old, nextSite)) {
      nextSites.push(item.old);
      continue;
    }

    updated += 1;
    nextSites.push(nextSite);
  }

  const dedupedNextSites = dedupeCachedSitesByIdentity(nextSites);
  dedupedNextSites.sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title));

  const nextCache: NotionCacheFile = {
    syncedAt: nowIso,
    sites: dedupedNextSites,
  };

  if (lockFile.locked) {
    const oldKeys = Object.keys(lockFile.items);
    const newKeys = Object.keys(pendingLockUpdates);
    const hasChange =
      oldKeys.length !== newKeys.length ||
      newKeys.some((key) => {
        const previous = lockFile.items[key];
        const next = pendingLockUpdates[key];
        if (!previous || !next) return true;
        return previous.category !== next.category || previous.subcategory !== next.subcategory;
      });

    if (hasChange) {
      await writeClassificationLockFile({
        locked: true,
        lockedAt: lockFile.lockedAt ?? nowIso,
        items: pendingLockUpdates,
      });
    }
  }

  await writeCacheFile(nextCache);
  try {
    await writeBackupSnapshot(nextCache);
  } catch {
    // Backup failure should not block the main sync path.
  }

  return {
    synced: true,
    reason: "synced" as const,
    cache: nextCache,
    stats: {
      total: dedupedNextSites.length,
      created,
      updated,
      removed: Math.max(oldById.size - dedupedNextSites.length, 0),
    },
  };
}

export async function getClassificationLockStatus() {
  const lockFile = await readClassificationLockFile();
  const cache = await readCacheFile();
  return {
    locked: lockFile.locked,
    lockedAt: lockFile.lockedAt,
    count: Object.keys(lockFile.items).length,
    summary: buildClassificationSummary(cache.sites),
    syncedAt: cache.syncedAt,
  };
}

export async function confirmClassificationLockFromCache() {
  const cache = await readCacheFile();
  if (!cache.sites.length) {
    throw new Error("No cached sites found. Run sync first.");
  }

  const nowIso = new Date().toISOString();
  const items: Record<string, LockedClassification> = {};
  for (const site of cache.sites) {
    if (!site.url) continue;
    const category = normalizeCategory(site.category) ?? "RESOURCES";
    items[buildUrlDedupKey(site.url)] = {
      category,
      subcategory: normalizeSubcategoryForCategory(category, site.subcategory),
      lockedAt: nowIso,
    };
  }

  await writeClassificationLockFile({
    locked: true,
    lockedAt: nowIso,
    items,
  });

  return {
    locked: true,
    lockedAt: nowIso,
    count: Object.keys(items).length,
  };
}

export async function unlockClassificationLock() {
  const lockFile = await readClassificationLockFile();
  await writeClassificationLockFile({
    ...lockFile,
    locked: false,
    lockedAt: null,
  });

  return {
    locked: false,
    lockedAt: null,
    count: Object.keys(lockFile.items).length,
  };
}

export async function getSitesForClient() {
  try {
    const syncResult = await syncNotionSites(false);
    const sites = mapCachedSitesToClientSites(syncResult.cache.sites);

    if (sites.length > 0) {
      try {
        await writeBackupSnapshot(syncResult.cache);
      } catch {
        // Ignore backup write errors.
      }

      return {
        sites,
        source: "notion" as const,
        syncedAt: syncResult.cache.syncedAt,
      };
    }
  } catch {
    // Fall through to backup/cache fallback.
  }

  return getFallbackSitesFromBackupOrCache();
}

export async function getNotionSyncStatus() {
  const cache = await readCacheFile();
  return {
    configured: hasNotionConfig(),
    syncedAt: cache.syncedAt,
    count: cache.sites.length,
  };
}
