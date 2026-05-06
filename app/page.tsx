"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent } from "react";
import { IdenticonAvatar } from "@/components/identicon-avatar";
import { ListEmptyState } from "@/components/list-empty-state";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SavedSite } from "@/lib/site-types";
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
  screenshotUrl?: string;
};

type CategoryTreeBranch = {
  category: string;
  subcategories: string[];
};

type SitePreviewInteractionMode = "hover" | "focus";

const screenshotStatusCache = new Map<string, "ready">();
const faviconStatusCache = new Map<string, "ready" | "error">();
const INITIAL_SITES_LIMIT = 24;
const BACKGROUND_SITES_LIMIT = 48;
const SITES_CACHE_KEY = "arcory-sites-cache-v3";
const CATEGORY_FILTER_STATE_KEY = "arcory-category-filter-state-v2";
const PREVIEW_PRELOAD_COUNT = 12;
const PREVIEW_PRELOAD_DELAY_MS = 180;
const CATEGORY_NAV_ORDER = ["Design", "Visual", "AI", "Product", "Dev", "Knowledge"] as const;
const INTERACTIVE_SURFACE_CLASS = "arcory-interactive-surface";
const TREE_REVEAL_STEP_MS = 18;
const SITE_REVEAL_STEP_MS = 14;
const REVEAL_MAX_DELAY_MS = 180;
const MODE_SHORTCUT_ITEMS = [
  { key: "D", label: "Day" },
  { key: "S", label: "Summer" },
  { key: "R", label: "Rain" },
  { key: "N", label: "Night" },
  { key: "M", label: "Midnight" },
  { key: "C", label: "Chaos" },
] as const;

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

function getSiteCategory(site: SavedSite) {
  return typeof site.category === "string" ? site.category.trim() : "";
}

function getSiteSubcategory(site: SavedSite) {
  return typeof site.subcategory === "string" ? site.subcategory.trim() : "";
}

function sortCategoryBranch(a: string, b: string) {
  const leftIndex = CATEGORY_NAV_ORDER.indexOf(a as (typeof CATEGORY_NAV_ORDER)[number]);
  const rightIndex = CATEGORY_NAV_ORDER.indexOf(b as (typeof CATEGORY_NAV_ORDER)[number]);

  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;
  return a.localeCompare(b, "en");
}

function getRevealStyle(delayMs: number) {
  return {
    animationDelay: `${Math.min(delayMs, REVEAL_MAX_DELAY_MS)}ms`,
  };
}

function buildCategoryTree(sites: SavedSite[]) {
  const grouped = new Map<string, Set<string>>();

  for (const site of sites) {
    const category = getSiteCategory(site);
    const subcategory = getSiteSubcategory(site);
    if (!category) continue;

    if (!grouped.has(category)) {
      grouped.set(category, new Set<string>());
    }

    if (subcategory) {
      grouped.get(category)?.add(subcategory);
    }
  }

  return Array.from(grouped.entries())
    .sort((a, b) => sortCategoryBranch(a[0], b[0]))
    .map(([category, subcategories]) => ({
      category,
      subcategories: Array.from(subcategories).sort((left, right) => left.localeCompare(right, "en")),
    } satisfies CategoryTreeBranch));
}

function TreeCategoryPrefix({ isLast }: { isLast: boolean }) {
  return (
    <span aria-hidden className="arcory-tree-prefix relative block h-6 w-6 shrink-0">
      <span
        className={cn(
          "arcory-tree-connector absolute left-2 border-l border-divider-strong",
          isLast ? "top-0 h-1/2" : "top-0 bottom-0",
        )}
      />
      <span className="arcory-tree-connector absolute left-2 top-1/2 w-3 -translate-y-1/2 border-t border-divider-strong" />
    </span>
  );
}

function TreeSubcategoryPrefix({
  isCategoryLast,
  isLast,
}: {
  isCategoryLast: boolean;
  isLast: boolean;
}) {
  return (
    <span aria-hidden className="arcory-tree-prefix relative block h-6 w-11 shrink-0">
      {!isCategoryLast ? <span className="arcory-tree-connector absolute left-2 top-0 bottom-0 border-l border-divider-strong" /> : null}
      <span
        className={cn(
          "arcory-tree-connector absolute left-7 border-l border-divider-strong",
          isLast ? "top-0 h-1/2" : "top-0 bottom-0",
        )}
      />
      <span className="arcory-tree-connector absolute left-7 top-1/2 w-3 -translate-y-1/2 border-t border-divider-strong" />
    </span>
  );
}
function buildFaviconCandidates(host: string) {
  if (!host) return [];

  return [
    `https://${host}/apple-touch-icon.png`,
    `https://${host}/favicon.png`,
    `https://${host}/favicon.ico`,
  ];
}

function SiteListAvatar({ seed, host }: { seed: string; host: string }) {
  const faviconCandidates = useMemo(() => buildFaviconCandidates(host), [host]);
  const readyIndex = faviconCandidates.findIndex((candidate) => faviconStatusCache.get(candidate) === "ready");
  const pendingIndex = faviconCandidates.findIndex((candidate) => faviconStatusCache.get(candidate) !== "error");
  const initialFaviconIndex = readyIndex >= 0 ? readyIndex : pendingIndex;
  const [faviconIndex, setFaviconIndex] = useState(initialFaviconIndex);
  const [faviconStatus, setFaviconStatus] = useState<"loading" | "ready" | "error">(() => {
    if (initialFaviconIndex < 0) return "error";
    return readyIndex >= 0 ? "ready" : "loading";
  });
  const faviconUrl = faviconIndex >= 0 ? (faviconCandidates[faviconIndex] ?? "") : "";

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
            setFaviconIndex(-1);
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

  const notionScreenshotProxy =
    site.source === "notion" ? `/api/notion/screenshot?pageId=${encodeURIComponent(site.id)}` : undefined;

  return {
    id: site.id,
    title: site.title,
    url: normalizedUrl,
    host: getSiteHost(normalizedUrl),
    meta: site.meta,
    // Notion items must always use server-side compressed cache instead of direct image URL.
    screenshotUrl: site.source === "notion" ? notionScreenshotProxy : normalizeSiteUrl(site.screenshot) || undefined,
  };
}

function HoverPreviewPanel({ item, className }: { item: HoverPreviewItem; className?: string }) {
  const screenshotUrl = item.screenshotUrl ?? "";
  const hasScreenshot = Boolean(screenshotUrl);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => {
    if (!hasScreenshot) return "error";
    return screenshotStatusCache.get(screenshotUrl) === "ready" ? "ready" : "loading";
  });
  const shouldRequestScreenshot = hasScreenshot && status !== "error";

  useEffect(() => {
    if (!shouldRequestScreenshot || status !== "loading") return;

    const timeoutId = window.setTimeout(() => {
      setStatus("error");
    }, 90000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shouldRequestScreenshot, status]);

  return (
    <aside
      className={cn(
        "pointer-events-none overflow-hidden rounded-none border border-border bg-card",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-muted/70 via-muted/35 to-card sm:aspect-[4/3]">
        {shouldRequestScreenshot ? (
          <img
            alt=""
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
              status === "ready" ? "opacity-100" : "opacity-0",
            )}
            decoding="async"
            loading="eager"
            onError={() => {
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
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
            Loading preview...
          </div>
        ) : null}
        {!hasScreenshot || status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
            Pending
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function IdlePreviewPanel({
  keyword,
  total,
  className,
}: {
  keyword: string;
  total: number;
  className?: string;
}) {
  const label = keyword.trim() ? `Search: ${keyword.trim()}` : "All sites";

  return (
    <aside className={cn("overflow-hidden rounded-none border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>Preview</span>
        <span>{label}</span>
      </div>
      <div className="flex aspect-[16/10] flex-col justify-between bg-gradient-to-br from-muted/65 via-muted/25 to-card p-5 sm:aspect-[4/3]">
        <div className="space-y-2.5">
          <p className="text-sm text-foreground">Hover a site to inspect its screenshot.</p>
          <p className="max-w-[28ch] text-xs leading-5 text-muted-foreground">
            The right column is reserved for the active preview so the middle list can stay dense and readable.
          </p>
        </div>
        <div className="border-t border-divider pt-4 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {total} entries ready
        </div>
      </div>
    </aside>
  );
}

function LoadingCategoryTreeNav() {
  const skeletonBranches = [
    { categoryWidth: 60, subcategoryWidths: [84, 74, 92] },
    { categoryWidth: 54, subcategoryWidths: [78, 70] },
    { categoryWidth: 38, subcategoryWidths: [72, 86, 68, 80] },
    { categoryWidth: 72, subcategoryWidths: [64, 88] },
    { categoryWidth: 34, subcategoryWidths: [] },
    { categoryWidth: 86, subcategoryWidths: [] },
  ];

  return (
    <div className="space-y-1 font-mono text-[14px] leading-6 text-foreground">
      <div className="px-1 text-lg leading-none">Arcory</div>
      <div className="mt-3 space-y-0.5">
        {skeletonBranches.map((branch, branchIndex) => {
          const isLastCategory = branchIndex === skeletonBranches.length - 1;

          return (
            <div className="px-1" key={"loading-tree-row-" + branchIndex}>
              <div className="flex items-center">
                <TreeCategoryPrefix isLast={isLastCategory} />
                <div
                  className="h-3 animate-pulse rounded-none bg-muted/65"
                  style={{ width: branch.categoryWidth }}
                />
              </div>

              {branch.subcategoryWidths.map((width, subcategoryIndex) => {
                const isLastSubcategory = subcategoryIndex === branch.subcategoryWidths.length - 1;

                return (
                  <div className="flex items-center" key={"loading-tree-row-" + branchIndex + "-sub-" + subcategoryIndex}>
                    <TreeSubcategoryPrefix isCategoryLast={isLastCategory} isLast={isLastSubcategory} />
                    <div
                      className="h-3 animate-pulse rounded-none bg-muted/50"
                      style={{ width }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryTreeNav({
  activeCategory,
  activeSubcategory,
  branches,
  expandedCategories,
  isRootActive,
  isRootPinned,
  onCategorySelect,
  onRootSelect,
  onSubcategorySelect,
}: {
  activeCategory: string | null;
  activeSubcategory: string | null;
  branches: CategoryTreeBranch[];
  expandedCategories: string[];
  isRootActive: boolean;
  isRootPinned: boolean;
  onCategorySelect: (category: string) => void;
  onRootSelect: () => void;
  onSubcategorySelect: (category: string, subcategory: string) => void;
}) {
  return (
    <TooltipProvider>
      <nav className="arcory-tree-nav font-mono text-[14px] leading-6 text-foreground">
        <Tooltip open={isRootActive ? false : undefined}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "arcory-tree-root sticky top-0 z-10 flex w-full cursor-pointer items-center rounded-none bg-card px-1 pt-[6px] text-left text-lg leading-none outline-none ring-0 transition-[padding] focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                isRootPinned && "pb-3",
              )}
              data-active={isRootActive ? "true" : undefined}
              onClick={onRootSelect}
              type="button"
            >
              <span className="arcory-tree-label">Arcory</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="arcory-root-tooltip">All sites</TooltipContent>
        </Tooltip>

        <div className="mt-3 space-y-0.5">
          {branches.map((branch, branchIndex) => {
            const isLastCategory = branchIndex === branches.length - 1;
            const branchActive = activeCategory === branch.category;
            const categoryDirectActive = branchActive && !activeSubcategory;
            const branchExpanded = expandedCategories.includes(branch.category);

            return (
              <div
                className="arcory-reveal-item"
                key={branch.category}
                style={getRevealStyle(branchIndex * TREE_REVEAL_STEP_MS)}
              >
                <button
                  className="arcory-tree-node group flex w-full cursor-pointer items-center rounded-none px-1 text-left outline-none ring-0 transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                  data-active={categoryDirectActive ? "true" : undefined}
                  onClick={() => onCategorySelect(branch.category)}
                  type="button"
                >
                  <TreeCategoryPrefix isLast={isLastCategory} />
                  <span className="arcory-tree-label min-w-0 truncate">{branch.category}</span>
                </button>
                {branchExpanded
                  ? branch.subcategories.map((subcategory, subcategoryIndex) => {
                      const isLastSubcategory = subcategoryIndex === branch.subcategories.length - 1;
                      const subcategoryActive = branchActive && activeSubcategory === subcategory;

                      return (
                        <div
                          className="arcory-reveal-item"
                          key={branch.category + "-" + subcategory}
                          style={getRevealStyle(branchIndex * TREE_REVEAL_STEP_MS + (subcategoryIndex + 1) * 12)}
                        >
                          <button
                          className="arcory-tree-node group flex w-full cursor-pointer items-center rounded-none px-1 text-left outline-none ring-0 transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                          data-active={subcategoryActive ? "true" : undefined}
                          onClick={() => onSubcategorySelect(branch.category, subcategory)}
                          type="button"
                        >
                          <TreeSubcategoryPrefix isCategoryLast={isLastCategory} isLast={isLastSubcategory} />
                          <span
                            className={cn(
                              "arcory-tree-label min-w-0 truncate text-muted-foreground transition-colors group-hover:text-foreground",
                              subcategoryActive && "text-foreground",
                            )}
                          >
                            {subcategory}
                          </span>
                        </button>
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
}

function LoadingSiteRows() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="flex items-center gap-2 rounded-sm px-1 py-3" key={`loading-row-${index}`}>
          <div className="h-4 w-2 animate-pulse rounded bg-muted" />
          <IdenticonAvatar
            alt=""
            className="size-5 opacity-70"
            monoChroma={0.08}
            monoLightnessHigh={0.8}
            monoLightnessLow={0.35}
            seed={`loading-site-${index}`}
            size={20}
          />
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
  rowIndex,
  isFocusActive,
  onHoverEnd,
  onHoverStart,
  onFocusStart,
  registerRowRef,
}: {
  site: SavedSite;
  rowIndex: number;
  isFocusActive: boolean;
  onHoverEnd?: () => void;
  onHoverStart?: (site: SavedSite, rowIndex: number) => void;
  onFocusStart?: (site: SavedSite, rowIndex: number) => void;
  registerRowRef?: (index: number, node: HTMLButtonElement | null) => void;
}) {
  const metaTokens = site.meta
    .split("•")
    .map((item) => item.trim())
    .filter(Boolean);
  const targetUrl = normalizeSiteUrl(site.url);
  const targetHost = getSiteHost(targetUrl);

  return (
    <button
      className={cn(
        "arcory-site-row arcory-list-divider group flex w-full cursor-pointer items-center gap-2.5 rounded-none border-b border-divider px-1 py-2.5 text-left text-[12px] transition-colors duration-150",
        INTERACTIVE_SURFACE_CLASS,
        !targetUrl && "cursor-not-allowed opacity-60",
      )}
      data-focus-active={isFocusActive ? "true" : undefined}
      data-site-id={site.id}
      data-site-row="true"
      disabled={!targetUrl}
      onClick={() => window.open(targetUrl, "_blank", "noopener,noreferrer")}
      onFocus={() => onFocusStart?.(site, rowIndex)}
      onMouseEnter={() => onHoverStart?.(site, rowIndex)}
      onMouseLeave={onHoverEnd}
      ref={(node) => registerRowRef?.(rowIndex, node)}
      type="button"
    >
      <div className="arcory-site-row-chevron flex items-center justify-center pr-1 text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
        &gt;
      </div>
      <span className="arcory-site-row-avatar inline-flex"><SiteListAvatar host={targetHost} key={targetHost} seed={site.title} /></span>
      <div className="flex min-w-0 flex-1 items-start pl-0">
        <div className="arcory-site-row-copy min-w-0 space-y-0.5">
          <p className="truncate text-[14px] text-foreground">{site.title}</p>
          <p className="arcory-site-row-meta truncate text-[10px] leading-4 text-muted-foreground">
            {metaTokens.map((item, index) => (
              <span key={`${site.id}-${item}`}>
                {index > 0 ? <span className="px-1">•</span> : null}
                {item}
              </span>
            ))}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [sites, setSites] = useState<SavedSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isHydratingSites, setIsHydratingSites] = useState(false);
  const [hasMoreSites, setHasMoreSites] = useState(false);
  const isListUiVisible = true;
  const [sitePreviewInteractionMode, setSitePreviewInteractionMode] = useState<SitePreviewInteractionMode | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [focusedSiteId, setFocusedSiteId] = useState<string | null>(null);
  const [isSiteListHovered, setIsSiteListHovered] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [isCategoryRootPinned, setIsCategoryRootPinned] = useState(false);
  const previewPrefetchingRef = useRef(new Set<string>());
  const siteRowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sitePreviewInteractionModeRef = useRef<SitePreviewInteractionMode | null>(null);
  const isCategoryFilterPersistenceReadyRef = useRef(false);
  const categoryNavScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CATEGORY_FILTER_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          activeCategory?: unknown;
          activeSubcategory?: unknown;
        };

        const nextActiveCategory =
          typeof parsed.activeCategory === "string" && parsed.activeCategory.trim().length > 0
            ? parsed.activeCategory
            : null;
        const nextActiveSubcategory =
          typeof parsed.activeSubcategory === "string" && parsed.activeSubcategory.trim().length > 0
            ? parsed.activeSubcategory
            : null;

        setActiveCategory(nextActiveCategory);
        setActiveSubcategory(nextActiveSubcategory);
      }
    } catch {
      // Ignore category filter cache parse failures.
    } finally {
      queueMicrotask(() => {
        isCategoryFilterPersistenceReadyRef.current = true;
      });
    }
  }, []);

  useEffect(() => {
    const container = categoryNavScrollRef.current;
    if (!container) return;

    const syncPinnedState = () => {
      setIsCategoryRootPinned(container.scrollTop > 0);
    };

    syncPinnedState();
    container.addEventListener("scroll", syncPinnedState, { passive: true });

    return () => {
      container.removeEventListener("scroll", syncPinnedState);
    };
  }, []);

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
      let seeded = false;
      try {
        const cachedRaw = sessionStorage.getItem(SITES_CACHE_KEY);
        if (cachedRaw) {
          const cachedSites = JSON.parse(cachedRaw) as SavedSite[];
          if (Array.isArray(cachedSites) && cachedSites.length > 0) {
            setSites(cachedSites);
            seeded = true;
          }
        }
      } catch {
        // Ignore local cache parse failures.
      }

      setIsLoadingSites(!seeded);
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
        try {
          sessionStorage.setItem(SITES_CACHE_KEY, JSON.stringify(data.sites));
        } catch {
          // Ignore storage quota errors.
        }

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

  const categoryTree = useMemo(() => buildCategoryTree(sites), [sites]);

  const filteredSites = useMemo(() => {
    const searchValue = keyword.trim().toLowerCase();

    return sites.filter((site) => {
      const keywordMatched = !searchValue || site.title.toLowerCase().includes(searchValue);
      const category = getSiteCategory(site);
      const subcategory = getSiteSubcategory(site);
      const categoryMatched = !activeCategory || category === activeCategory;
      const subcategoryMatched = !activeSubcategory || subcategory === activeSubcategory;

      return keywordMatched && categoryMatched && subcategoryMatched;
    });
  }, [activeCategory, activeSubcategory, keyword, sites]);

  const activeFilterLabel = activeSubcategory ?? activeCategory;
  const expandedCategories = useMemo(() => (activeCategory ? [activeCategory] : []), [activeCategory]);
  const isRootCategoryActive = !activeCategory && !activeSubcategory;

  const updateSitePreviewInteractionMode = (mode: SitePreviewInteractionMode | null) => {
    sitePreviewInteractionModeRef.current = mode;
    setSitePreviewInteractionMode(mode);
  };

  const resetCategoryFilters = () => {
    setActiveCategory(null);
    setActiveSubcategory(null);
  };

  const scrollPrimaryColumnsToTop = () => {
    categoryNavScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const registerSiteRowRef = (index: number, node: HTMLButtonElement | null) => {
    siteRowRefs.current[index] = node;
  };

  const blurActiveSiteRow = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLButtonElement && activeElement.dataset.siteRow === "true") {
      activeElement.blur();
    }
  };

  const findRowIndexBySiteId = (siteId: string | null) => {
    if (!siteId) return -1;
    return filteredSites.findIndex((site) => site.id === siteId);
  };

  const getFirstNavigableRowIndex = (direction: 1 | -1) => {
    const startIndex = direction === 1 ? 0 : filteredSites.length - 1;
    for (
      let index = startIndex;
      index >= 0 && index < filteredSites.length;
      index += direction
    ) {
      if (normalizeSiteUrl(filteredSites[index]?.url)) return index;
    }
    return -1;
  };

  const focusSiteRowByIndex = (nextIndex: number) => {
    const nextButton = siteRowRefs.current[nextIndex];
    const nextSite = filteredSites[nextIndex];
    if (!nextButton || !nextSite || nextButton.disabled) return;

    updateSitePreviewInteractionMode("focus");
    setHoveredSiteId(null);
    setFocusedSiteId(nextSite.id);
    nextButton.focus({ preventScroll: true });
    nextButton.scrollIntoView({ block: "nearest" });
  };

  const moveFocusedSiteRow = (direction: 1 | -1) => {
    const currentIndex =
      findRowIndexBySiteId(focusedSiteId) >= 0
        ? findRowIndexBySiteId(focusedSiteId)
        : findRowIndexBySiteId(hoveredSiteId);

    if (currentIndex < 0) {
      const fallbackIndex = getFirstNavigableRowIndex(direction);
      if (fallbackIndex >= 0) {
        focusSiteRowByIndex(fallbackIndex);
      }
      return;
    }

    for (
      let nextIndex = currentIndex + direction;
      nextIndex >= 0 && nextIndex < filteredSites.length;
      nextIndex += direction
    ) {
      const nextButton = siteRowRefs.current[nextIndex];
      if (!nextButton || nextButton.disabled) continue;
      focusSiteRowByIndex(nextIndex);
      return;
    }
  };

  const hoveredPreview = useMemo(
    () => filteredSites.find((site) => site.id === hoveredSiteId),
    [filteredSites, hoveredSiteId],
  );

  const focusedPreview = useMemo(
    () => filteredSites.find((site) => site.id === focusedSiteId),
    [filteredSites, focusedSiteId],
  );

  const resolvedActivePreview = useMemo(() => {
    if (sitePreviewInteractionMode === "hover") {
      return hoveredPreview ? buildHoverPreviewItem(hoveredPreview) : null;
    }

    if (sitePreviewInteractionMode === "focus") {
      return focusedPreview ? buildHoverPreviewItem(focusedPreview) : null;
    }

    return null;
  }, [focusedPreview, hoveredPreview, sitePreviewInteractionMode]);

  const fallbackPreview = useMemo(
    () => filteredSites.map((site) => buildHoverPreviewItem(site)).find((item): item is HoverPreviewItem => item !== null) ?? null,
    [filteredSites],
  );

  const displayPreview = resolvedActivePreview ?? fallbackPreview;
  const isCategoryFilterValidationPending =
    isLoadingSites || isHydratingSites || hasMoreSites;

  useEffect(() => {
    siteRowRefs.current.length = filteredSites.length;
  }, [filteredSites.length]);

  useEffect(() => {
    const visibleSiteIds = new Set(filteredSites.map((site) => site.id));

    if (hoveredSiteId && !visibleSiteIds.has(hoveredSiteId)) {
      setHoveredSiteId(null);
      if (sitePreviewInteractionMode === "hover") {
        updateSitePreviewInteractionMode(null);
      }
    }

    if (focusedSiteId && !visibleSiteIds.has(focusedSiteId)) {
      setFocusedSiteId(null);
      if (sitePreviewInteractionMode === "focus") {
        updateSitePreviewInteractionMode(null);
      }
    }
  }, [filteredSites, focusedSiteId, hoveredSiteId, sitePreviewInteractionMode]);

  const handleListHotkeys = useEffectEvent((event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement) {
      return;
    }
    if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
      return;
    }

    event.preventDefault();
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      moveFocusedSiteRow(1);
      return;
    }

    moveFocusedSiteRow(-1);
  });

  useEffect(() => {
    if (!isSiteListHovered) return;

    const onKeyDown = (event: KeyboardEvent) => {
      handleListHotkeys(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSiteListHovered]);

  useEffect(() => {
    if (sites.length === 0) return;
    try {
      sessionStorage.setItem(SITES_CACHE_KEY, JSON.stringify(sites));
    } catch {
      // Ignore storage quota errors.
    }
  }, [sites]);

  useEffect(() => {
    if (!isCategoryFilterPersistenceReadyRef.current) return;

    try {
      sessionStorage.setItem(
        CATEGORY_FILTER_STATE_KEY,
        JSON.stringify({
          activeCategory,
          activeSubcategory,
        }),
      );
    } catch {
      // Ignore storage quota errors.
    }
  }, [activeCategory, activeSubcategory]);

  useEffect(() => {
    if (!activeCategory) {
      if (activeSubcategory) setActiveSubcategory(null);
      return;
    }

    // Restored filters may target items that have not reached the client yet.
    // Only validate once the current sync cycle has fully settled.
    if (isCategoryFilterValidationPending || (sites.length === 0 && categoryTree.length === 0)) {
      return;
    }

    const categoryStillExists = categoryTree.some((branch) => branch.category === activeCategory);
    if (!categoryStillExists) {
      setActiveCategory(null);
      setActiveSubcategory(null);
      return;
    }

    if (!activeSubcategory) return;
    const subcategoryStillExists = categoryTree.some(
      (branch) => branch.category === activeCategory && branch.subcategories.includes(activeSubcategory),
    );

    if (!subcategoryStillExists) {
      setActiveSubcategory(null);
    }
  }, [activeCategory, activeSubcategory, categoryTree, isCategoryFilterValidationPending, sites.length]);

  useEffect(() => {
    if (!isListUiVisible || sites.length === 0) return;
    if (resolvedActivePreview) return;

    const candidates = sites
      .slice(0, PREVIEW_PRELOAD_COUNT)
      .map((site) => buildHoverPreviewItem(site)?.screenshotUrl ?? "")
      .filter(Boolean);

    if (candidates.length === 0) return;

    const timerId = window.setTimeout(() => {
      for (const url of candidates) {
        if (screenshotStatusCache.get(url) === "ready") continue;
        if (previewPrefetchingRef.current.has(url)) continue;

        previewPrefetchingRef.current.add(url);
        const image = new window.Image();
        image.decoding = "async";
        image.onload = () => {
          screenshotStatusCache.set(url, "ready");
          previewPrefetchingRef.current.delete(url);
        };
        image.onerror = () => {
          previewPrefetchingRef.current.delete(url);
        };
        image.src = url;
      }
    }, PREVIEW_PRELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [resolvedActivePreview, isListUiVisible, sites]);

  return (
    <main className="arcory-page-shell min-h-[100dvh] bg-background">
      <div className="arcory-chaos-panel min-h-[100dvh] bg-card xl:grid xl:min-h-[100dvh] xl:grid-cols-[220px_minmax(0,calc(460px+(min(100vw,1728px)-1280px)*0.1919642857))_minmax(0,calc(520px+(min(100vw,1728px)-1280px)*0.2366071429))] xl:justify-center">
        <div className="arcory-chaos-column arcory-column-divider px-6 pt-6 xl:min-h-[100dvh] xl:border-r xl:border-divider xl:px-0 xl:pr-6 xl:pt-6">
          <aside className="mx-auto w-full max-w-[720px] xl:sticky xl:top-6 xl:flex xl:h-[calc(100dvh-24px)] xl:max-w-none xl:flex-col xl:pb-4">
            <div className="no-scrollbar min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-1" ref={categoryNavScrollRef}>
              {isLoadingSites ? (
                <LoadingCategoryTreeNav />
              ) : (
                <CategoryTreeNav
                  activeCategory={activeCategory}
                  activeSubcategory={activeSubcategory}
                  branches={categoryTree}
                  expandedCategories={expandedCategories}
                  isRootActive={isRootCategoryActive}
                  isRootPinned={isCategoryRootPinned}
                  onCategorySelect={(category) => {
                    if (activeCategory === category && !activeSubcategory) {
                      resetCategoryFilters();
                      return;
                    }

                    setActiveCategory(category);
                    setActiveSubcategory(null);
                  }}
                  onRootSelect={() => {
                    resetCategoryFilters();
                    scrollPrimaryColumnsToTop();
                  }}
                  onSubcategorySelect={(category, subcategory) => {
                    if (activeCategory === category && activeSubcategory === subcategory) {
                      setActiveSubcategory(null);
                      return;
                    }

                    setActiveCategory(category);
                    setActiveSubcategory(subcategory);
                  }}
                />
              )}
            </div>

            <div className="mt-8 hidden shrink-0 pt-4 text-[11px] leading-5 text-muted-foreground xl:mt-auto xl:block">
              <p className="text-[10px] uppercase tracking-[0.08em]">Mode Shortcuts</p>
              <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5">
                {MODE_SHORTCUT_ITEMS.map((item) => (
                  <div className="flex items-center gap-3" key={item.key}>
                    <span className="text-foreground">{item.key}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <section className="arcory-chaos-column min-w-0 px-6 pb-8 pt-5 sm:pb-10 xl:min-h-[100dvh] xl:px-6 xl:pt-6">
          <div className="mx-auto flex h-full w-full max-w-[720px] flex-col xl:max-w-none">
            <section className="flex-1">
              {isListUiVisible ? (
                <>
                  <div className="arcory-chaos-toolbar sticky top-0 z-20 bg-card pb-4 pt-4 xl:top-6 xl:pt-0 xl:before:pointer-events-none xl:before:absolute xl:before:-top-6 xl:before:left-0 xl:before:block xl:before:h-6 xl:before:w-full xl:before:bg-card xl:before:content-['']">
                    <Input
                      aria-label="Search saved websites"
                      className="arcory-search-input h-8 rounded-none border-input bg-transparent px-2 text-xs shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                      placeholder="Search"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                    />
                  </div>

                  <div
                    className="mt-1"
                    onBlur={(event: ReactFocusEvent<HTMLDivElement>) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                      if (sitePreviewInteractionModeRef.current !== "focus") return;
                      setFocusedSiteId(null);
                      updateSitePreviewInteractionMode(null);
                    }}
                    onMouseEnter={() => setIsSiteListHovered(true)}
                    onMouseLeave={() => {
                      setIsSiteListHovered(false);
                      setHoveredSiteId(null);
                      if (sitePreviewInteractionModeRef.current === "hover") {
                        updateSitePreviewInteractionMode(null);
                      }
                    }}
                    onPointerMove={(event) => {
                      if (sitePreviewInteractionModeRef.current !== "focus") return;
                      const row = (event.target instanceof HTMLElement
                        ? event.target.closest<HTMLButtonElement>("[data-site-row='true']")
                        : null);
                      const hoveredSiteIdFromPointer = row?.dataset.siteId;
                      if (!hoveredSiteIdFromPointer) return;
                      blurActiveSiteRow();
                      setFocusedSiteId(null);
                      setHoveredSiteId(hoveredSiteIdFromPointer);
                      updateSitePreviewInteractionMode("hover");
                    }}
                  >
                    {isLoadingSites ? (
                      <LoadingSiteRows />
                    ) : filteredSites.length > 0 ? (
                      filteredSites.map((site, index) => (
                        <div className="arcory-reveal-item" key={site.id} style={getRevealStyle(index * SITE_REVEAL_STEP_MS)}>
                          <SavedSiteRow
                            isFocusActive={sitePreviewInteractionMode === "focus" && focusedSiteId === site.id}
                            onFocusStart={(nextSite) => {
                              updateSitePreviewInteractionMode("focus");
                              setHoveredSiteId(null);
                              setFocusedSiteId(nextSite.id);
                            }}
                            onHoverEnd={() => {
                              setHoveredSiteId(null);
                              if (sitePreviewInteractionModeRef.current === "hover") {
                                updateSitePreviewInteractionMode(null);
                              }
                            }}
                            onHoverStart={(nextSite) => {
                              if (sitePreviewInteractionModeRef.current === "focus") {
                                return;
                              }
                              setFocusedSiteId(null);
                              updateSitePreviewInteractionMode("hover");
                              setHoveredSiteId(nextSite.id);
                            }}
                            registerRowRef={registerSiteRowRef}
                            rowIndex={index}
                            site={site}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="arcory-chaos-empty">
                        <ListEmptyState category="ALL" mode="search" />
                      </div>
                    )}
                  </div>

                  <div className="arcory-chaos-summary py-4 text-center text-xs uppercase tracking-[0.06em] text-foreground">
                    {isLoadingSites
                      ? "Loading..."
                      : isHydratingSites || hasMoreSites
                        ? `${activeFilterLabel ? activeFilterLabel + " · " : ""}${filteredSites.length} Saves · Syncing more...`
                        : `${activeFilterLabel ? activeFilterLabel + " · " : ""}${filteredSites.length} Saves`}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="h-7 w-48 animate-pulse rounded-none bg-muted/70" />
                  <div className="h-8 w-full animate-pulse rounded-none bg-muted/60" />
                  <div className="h-32 w-full animate-pulse rounded-none bg-muted/50" />
                </div>
              )}
            </section>
          </div>
        </section>

        <div className="arcory-chaos-column arcory-column-divider hidden xl:block xl:min-h-[100dvh] xl:border-l xl:border-divider xl:pl-6 xl:pt-6">
          <aside className="sticky top-6 space-y-4">
            {displayPreview ? (
              <HoverPreviewPanel className="arcory-chaos-preview w-full" item={displayPreview} key={displayPreview.screenshotUrl ?? displayPreview.id} />
            ) : (
              <IdlePreviewPanel
                className="arcory-chaos-preview"
                keyword={keyword}
                total={filteredSites.length}
              />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
