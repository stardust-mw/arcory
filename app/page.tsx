"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { HeroAsciiGrid } from "@/components/hero-ascii-grid";
import { IdenticonAvatar } from "@/components/identicon-avatar";
import { ListEmptyState } from "@/components/list-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { categories, siteCategories, type Category, type SavedSite, type SiteCategory } from "@/lib/site-types";
import { cn } from "@/lib/utils";

type SitesApiResponse = {
  sites: SavedSite[];
  source: "notion" | "unavailable";
  syncedAt: string | null;
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

type HoverPreviewItem = {
  id: string;
  title: string;
  url: string;
  host: string;
  meta: string;
};

const screenshotStatusCache = new Map<string, "ready" | "error">();
const faviconStatusCache = new Map<string, "ready" | "error">();
const INITIAL_SITES_LIMIT = 24;
const BACKGROUND_SITES_LIMIT = 48;

function normalizeSiteUrl(value?: string) {
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

function getSiteHost(value?: string) {
  const normalized = normalizeSiteUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function buildScreenshotPreviewUrl(url: string) {
  const normalized = normalizeSiteUrl(url);
  if (!normalized) return "";
  return `https://image.thum.io/get/width/960/noanimate/${encodeURIComponent(normalized)}`;
}

function buildFaviconCandidates(host: string) {
  if (!host) return [];

  return [
    `https://${host}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
  ];
}

function SiteListAvatar({ seed, host }: { seed: string; host: string }) {
  const faviconCandidates = useMemo(() => buildFaviconCandidates(host), [host]);
  const [faviconIndex, setFaviconIndex] = useState(0);
  const [faviconStatus, setFaviconStatus] = useState<"loading" | "ready" | "error">("loading");
  const faviconUrl = faviconCandidates[faviconIndex] ?? "";

  useEffect(() => {
    if (faviconCandidates.length === 0) {
      setFaviconStatus("error");
      setFaviconIndex(0);
      return;
    }

    const readyIndex = faviconCandidates.findIndex((candidate) => faviconStatusCache.get(candidate) === "ready");
    if (readyIndex >= 0) {
      setFaviconIndex(readyIndex);
      setFaviconStatus("ready");
      return;
    }

    const pendingIndex = faviconCandidates.findIndex((candidate) => faviconStatusCache.get(candidate) !== "error");
    if (pendingIndex >= 0) {
      setFaviconIndex(pendingIndex);
      const cached = faviconStatusCache.get(faviconCandidates[pendingIndex]);
      setFaviconStatus(cached ?? "loading");
      return;
    }

    setFaviconIndex(0);
    setFaviconStatus("error");
  }, [faviconCandidates]);

  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
      {faviconStatus !== "ready" ? (
        <IdenticonAvatar
          alt={`${seed} identicon`}
          className="size-5"
          monoChroma={0.08}
          monoLightnessHigh={0.8}
          monoLightnessLow={0.35}
          seed={seed}
          size={20}
        />
      ) : null}
      {faviconUrl ? (
        <img
          alt=""
          className={cn(
            "absolute inset-0 size-5 object-cover transition-opacity duration-150",
            faviconStatus === "ready" ? "opacity-100" : "opacity-0",
          )}
          onError={() => {
            if (!faviconUrl) return;
            faviconStatusCache.set(faviconUrl, "error");
            const nextIndex = faviconCandidates.findIndex(
              (candidate, index) => index > faviconIndex && faviconStatusCache.get(candidate) !== "error",
            );
            if (nextIndex >= 0) {
              setFaviconIndex(nextIndex);
              setFaviconStatus("loading");
              return;
            }
            setFaviconStatus("error");
          }}
          onLoad={() => {
            if (!faviconUrl) return;
            faviconStatusCache.set(faviconUrl, "ready");
            setFaviconStatus("ready");
          }}
          src={faviconUrl}
        />
      ) : null}
    </span>
  );
}

function buildHoverPreviewItem(site: SavedSite): HoverPreviewItem | null {
  const normalizedUrl = normalizeSiteUrl(site.url);
  if (!normalizedUrl) return null;

  return {
    id: site.id,
    title: site.title,
    url: normalizedUrl,
    host: getSiteHost(normalizedUrl),
    meta: site.meta,
  };
}

function HoverPreviewPanel({ item, className }: { item: HoverPreviewItem; className?: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const screenshotUrl = buildScreenshotPreviewUrl(item.url);
  const faviconUrl = buildFaviconCandidates(item.host)[0] ?? "";
  const shouldRequestScreenshot = Boolean(screenshotUrl && status !== "error");
  const metaTokens = item.meta
    .split("•")
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  useEffect(() => {
    if (!screenshotUrl) {
      setStatus("error");
      return;
    }

    const cached = screenshotStatusCache.get(screenshotUrl);
    setStatus(cached ?? "loading");
  }, [screenshotUrl]);

  return (
    <aside
      className={cn(
        "pointer-events-none w-[320px] overflow-hidden rounded-none border border-border bg-card shadow-2xl",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="truncate text-xs text-foreground">{item.title}</p>
        <p className="ml-3 shrink-0 text-[11px] text-muted-foreground">{item.host}</p>
      </div>
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-muted/70 via-muted/35 to-card">
        <div className="absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-center gap-2">
            {faviconUrl ? (
              <img
                alt=""
                className="size-4 shrink-0 rounded-sm opacity-85"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = "none";
                }}
                src={faviconUrl}
              />
            ) : null}
            <p className="truncate text-[11px] text-foreground/90">{item.host}</p>
          </div>
          <div>
            <p className="line-clamp-2 text-[13px] text-foreground">{item.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {metaTokens.length > 0 ? metaTokens.join(" • ") : "Open in new tab"}
            </p>
          </div>
        </div>

        {shouldRequestScreenshot ? (
          <img
            alt=""
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
              status === "ready" ? "opacity-100" : "opacity-0",
            )}
            onError={() => {
              screenshotStatusCache.set(screenshotUrl, "error");
              setStatus("error");
            }}
            onLoad={() => {
              screenshotStatusCache.set(screenshotUrl, "ready");
              setStatus("ready");
            }}
            src={screenshotUrl}
          />
        ) : null}

        {status === "loading" ? (
          <div className="absolute right-2 bottom-2 rounded-none bg-background/85 px-1.5 py-1 text-[10px] text-muted-foreground">
            Loading preview...
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function LoadingSiteRows() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="flex items-center gap-2 rounded-sm px-1 py-3" key={`loading-row-${index}`}>
          <div className="h-4 w-2 animate-pulse rounded bg-muted" />
          <div className="size-5 animate-pulse rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="h-3 w-36 animate-pulse rounded bg-muted" />
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SavedSiteRow({
  site,
  onPreviewChange,
}: {
  site: SavedSite;
  onPreviewChange?: (item: HoverPreviewItem | null) => void;
}) {
  const metaTokens = site.meta
    .split("•")
    .map((item) => item.trim())
    .filter(Boolean);
  const targetUrl = normalizeSiteUrl(site.url);
  const targetHost = getSiteHost(targetUrl);
  const previewItem = buildHoverPreviewItem(site);
  const showPreview = () => {
    if (!previewItem) return;
    onPreviewChange?.(previewItem);
  };
  const hidePreview = () => {
    onPreviewChange?.(null);
  };

  return (
    <button
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-sm px-1 py-3 text-left text-xs transition-colors duration-150 hover:bg-muted/50",
        !targetUrl && "cursor-not-allowed opacity-60",
      )}
      disabled={!targetUrl}
      onClick={() => window.open(targetUrl, "_blank", "noopener,noreferrer")}
      onBlur={hidePreview}
      onFocus={showPreview}
      onMouseEnter={showPreview}
      onMouseLeave={hidePreview}
      type="button"
    >
      <div className="flex items-center justify-center pr-1 text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
        &gt;
      </div>
      <SiteListAvatar host={targetHost} seed={site.title} />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4 pl-0">
        <div className="min-w-0">
          <p className="truncate text-foreground">{site.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {metaTokens.map((item, index) => (
              <span key={`${site.id}-${item}`}>
                {index > 0 ? <span className="px-1">•</span> : null}
                {item}
              </span>
            ))}
          </p>
        </div>
        <p className="shrink-0 self-center text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
          {site.clicks} Clicks
        </p>
      </div>
    </button>
  );
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [activeSubcategory, setActiveSubcategory] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [sites, setSites] = useState<SavedSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isHydratingSites, setIsHydratingSites] = useState(false);
  const [hasMoreSites, setHasMoreSites] = useState(false);
  const [activePreview, setActivePreview] = useState<HoverPreviewItem | null>(null);
  const buttonRefs = useRef<Partial<Record<Category, HTMLButtonElement | null>>>({});

  useEffect(() => {
    let cancelled = false;

    const fetchSitesPage = async (offset: number, limit: number) => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      });
      const response = await fetch(`/api/sites?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return null;
      return (await response.json()) as SitesApiResponse;
    };

    const hydrateRemainingSites = async (startOffset: number) => {
      if (cancelled) return;

      setIsHydratingSites(true);
      let offset = startOffset;
      let shouldContinue = true;

      while (!cancelled && shouldContinue) {
        const data = await fetchSitesPage(offset, BACKGROUND_SITES_LIMIT);
        if (!data || !Array.isArray(data.sites) || data.sites.length === 0) {
          if (!cancelled) setHasMoreSites(false);
          break;
        }

        setSites((current) => {
          const ids = new Set(current.map((site) => site.id));
          const appended = data.sites.filter((site) => !ids.has(site.id));
          return appended.length > 0 ? [...current, ...appended] : current;
        });

        const nextHasMore = Boolean(data.hasMore);
        const nextOffset = typeof data.nextOffset === "number" ? data.nextOffset : offset + data.sites.length;
        if (!cancelled) {
          setHasMoreSites(nextHasMore);
        }

        offset = nextOffset;
        shouldContinue = nextHasMore;

        if (shouldContinue) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      if (!cancelled) {
        setIsHydratingSites(false);
      }
    };

    const fetchSites = async () => {
      setIsLoadingSites(true);
      setIsHydratingSites(false);
      setHasMoreSites(false);
      try {
        const data = await fetchSitesPage(0, INITIAL_SITES_LIMIT);
        if (!data || !Array.isArray(data.sites)) {
          if (!cancelled) setSites([]);
          return;
        }
        if (cancelled) return;

        setSites(data.sites);

        const nextHasMore = Boolean(data.hasMore);
        setHasMoreSites(nextHasMore);

        if (nextHasMore) {
          const nextOffset = typeof data.nextOffset === "number" ? data.nextOffset : data.sites.length;
          void hydrateRemainingSites(nextOffset);
        }
      } catch {
        if (!cancelled) setSites([]);
      } finally {
        if (!cancelled) setIsLoadingSites(false);
      }
    };

    void fetchSites();

    return () => {
      cancelled = true;
    };
  }, []);

  const subcategoriesByCategory = useMemo(() => {
    const grouped = Object.fromEntries(
      siteCategories.map((category) => [category, new Set<string>()]),
    ) as Record<SiteCategory, Set<string>>;

    for (const site of sites) {
      if (site.subcategory) {
        const normalizedSubcategory = site.subcategory.trim().toUpperCase();
        if (normalizedSubcategory !== site.category) {
          grouped[site.category].add(normalizedSubcategory);
        }
      }
    }

    return Object.fromEntries(
      siteCategories.map((category) => {
        const dynamic = Array.from(grouped[category]).sort((a, b) => a.localeCompare(b, "en"));
        return [category, dynamic];
      }),
    ) as Record<SiteCategory, string[]>;
  }, [sites]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<Category, number>;
    counts.ALL = sites.length;

    for (const site of sites) {
      counts[site.category] += 1;
    }

    return counts;
  }, [sites]);

  const filteredSites = useMemo(() => {
    const searchValue = keyword.trim().toLowerCase();

    return sites.filter((site) => {
      const categoryMatched = activeCategory === "ALL" || site.category === activeCategory;
      const subcategoryMatched =
        activeSubcategory === "ALL" || site.subcategory?.trim().toUpperCase() === activeSubcategory;
      const keywordMatched = !searchValue || site.title.toLowerCase().includes(searchValue);

      return categoryMatched && subcategoryMatched && keywordMatched;
    });
  }, [activeCategory, activeSubcategory, keyword, sites]);

  useEffect(() => {
    if (!activePreview) return;
    const stillInCurrentResult = filteredSites.some((site) => site.id === activePreview.id);
    if (!stillInCurrentResult) {
      setActivePreview(null);
    }
  }, [activePreview, filteredSites]);

  const switchCategoryByArrow = (current: Category, direction: 1 | -1) => {
    const currentIndex = categories.indexOf(current);
    if (currentIndex === -1 || categories.length <= 1) return;

    const nextIndex = (currentIndex + direction + categories.length) % categories.length;
    const nextCategory = categories[nextIndex];

    setActiveSubcategory("ALL");
    setActiveCategory(nextCategory);
    buttonRefs.current[nextCategory]?.focus();
  };

  const isCategoryEmpty =
    !isLoadingSites && activeCategory !== "ALL" && categoryCounts[activeCategory] === 0 && keyword.trim().length === 0;

  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[768px] flex-col bg-card px-6 pt-9 pb-10 sm:px-16 sm:pt-9 sm:pb-16">
        <header className="flex items-center justify-between text-sm">
          <Link className="flex items-center gap-1.5 text-foreground transition-colors hover:text-foreground/80" href="/">
            <IdenticonAvatar
              className="size-4"
              monoChroma={0}
              monoLightnessHigh={0.84}
              monoLightnessLow={0.12}
              seed="arcory-logo"
              size={16}
              variant="bayer-4x4-mono-oklch"
            />
            <span className="text-[16px] leading-none">Arcory</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button
              asChild
              className="hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
              size="sm"
              type="button"
              variant="ghost"
            >
              <Link href="/about">About</Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <section className="mt-12 flex justify-center">
          <HeroAsciiGrid />
        </section>

        <section className="mt-9">
          <div className="sticky top-0 z-20 -mx-1 bg-card/95 px-1 pt-2 pb-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div
              aria-label="Site categories"
              className="flex flex-wrap items-center gap-2 text-[13px] text-foreground"
              role="tablist"
            >
              {categories.map((category) => (
                <button
                  aria-selected={activeCategory === category}
                  className={cn(
                    "rounded-none px-1.5 py-1 leading-none transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground",
                    activeCategory === category &&
                      "bg-foreground text-background hover:bg-foreground/90 hover:text-background active:text-background dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary/80 dark:hover:text-secondary-foreground dark:active:bg-secondary/70 dark:active:text-secondary-foreground",
                  )}
                  key={category}
                  onClick={() => {
                    setActiveSubcategory("ALL");
                    setActiveCategory(category);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      switchCategoryByArrow(category, 1);
                    }

                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      switchCategoryByArrow(category, -1);
                    }
                  }}
                  ref={(node) => {
                    buttonRefs.current[category] = node;
                  }}
                  role="tab"
                  type="button"
                >
                  {category}
                </button>
              ))}
            </div>

            {activeCategory !== "ALL" ? (
              <div aria-label={`${activeCategory} subcategories`} className="no-scrollbar mt-2 overflow-x-auto">
                <div className="inline-flex items-center gap-2 whitespace-nowrap bg-muted px-1 py-1">
                  {subcategoriesByCategory[activeCategory].map((subcategory) => (
                    <button
                      aria-pressed={activeSubcategory === subcategory}
                      className={cn(
                        "rounded-none px-1.5 py-1 text-[11px] leading-none transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground",
                        activeSubcategory === subcategory &&
                          "bg-foreground text-background hover:bg-foreground/90 hover:text-background active:text-background dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary/80 dark:hover:text-secondary-foreground dark:active:bg-secondary/70 dark:active:text-secondary-foreground",
                      )}
                      key={subcategory}
                      onClick={() =>
                        setActiveSubcategory((current) => (current === subcategory ? "ALL" : subcategory))
                      }
                      type="button"
                    >
                      {subcategory}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Input
              aria-label="Search saved websites"
              className="mt-3 mb-1 h-8 rounded-none border-input bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
              placeholder="Search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <div className="mt-1">
            {isLoadingSites ? (
              <LoadingSiteRows />
            ) : isCategoryEmpty ? (
              <ListEmptyState category={activeCategory} mode="category" />
            ) : filteredSites.length > 0 ? (
              filteredSites.map((site) => (
                <SavedSiteRow key={site.id} onPreviewChange={setActivePreview} site={site} />
              ))
            ) : (
              <ListEmptyState category={activeCategory} mode="search" />
            )}
          </div>

          <div className="py-4 text-center text-xs uppercase tracking-[0.06em] text-foreground">
            {isLoadingSites
              ? "Loading..."
              : isHydratingSites || hasMoreSites
                ? `${filteredSites.length} Saves · Syncing more...`
                : `${filteredSites.length} Saves`}
          </div>
        </section>

        <footer className="mt-auto">
          <div className="flex items-center gap-4 pt-9 pb-0">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs uppercase tracking-[0.06em] text-foreground">Archive + story</p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </footer>
      </div>
      {activePreview ? (
        <div className="pointer-events-none fixed right-6 bottom-6 z-40 hidden lg:block">
          <HoverPreviewPanel className="rounded-none shadow-2xl" item={activePreview} />
        </div>
      ) : null}
    </main>
  );
}
