"use client";

import { useMemo, useRef, useState } from "react";

import { HeroAsciiGrid } from "@/components/hero-ascii-grid";
import { IdenticonAvatar } from "@/components/identicon-avatar";
import { ListEmptyState } from "@/components/list-empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const siteCategories = [
  "COMPONENTS",
  "DESIGN",
  "INSPIRATION",
  "KNOWLEDGE",
  "PROJECT",
  "RESOURCES",
  "SYSTEMS",
] as const;

type SiteCategory = (typeof siteCategories)[number];
type Category = "ALL" | SiteCategory;

const categories: Category[] = [
  "ALL",
  ...[...siteCategories].sort((a, b) => a.localeCompare(b, "en")),
];

type SavedSite = {
  id: string;
  title: string;
  meta: string;
  clicks: number;
  category: SiteCategory;
};

const savedSites: SavedSite[] = [
  { id: "site-1", title: "Vercel Identicon Prototypes", meta: "avatar•generator", clicks: 142, category: "DESIGN" },
  { id: "site-2", title: "OpenAI Playground", meta: "ai•sandbox", clicks: 188, category: "RESOURCES" },
  { id: "site-3", title: "Awwwards", meta: "design•inspiration", clicks: 66, category: "INSPIRATION" },
  { id: "site-4", title: "Notion Documentation", meta: "docs•knowledge", clicks: 97, category: "KNOWLEDGE" },
  { id: "site-5", title: "Shadcn/UI Registry", meta: "ui•components", clicks: 154, category: "RESOURCES" },
  { id: "site-5b", title: "Radix UI Primitives", meta: "components•a11y", clicks: 128, category: "COMPONENTS" },
  { id: "site-6", title: "Linear Changelog", meta: "product•updates", clicks: 48, category: "PROJECT" },
  { id: "site-7", title: "Anthropic Console", meta: "ai•api", clicks: 58, category: "RESOURCES" },
  { id: "site-8", title: "Design Systems Repo", meta: "design-system•reference", clicks: 45, category: "DESIGN" },
  { id: "site-9", title: "Mobbin UI Patterns", meta: "mobile-ui•patterns", clicks: 119, category: "INSPIRATION" },
  { id: "site-10", title: "MDN Web Docs", meta: "web•docs", clicks: 135, category: "KNOWLEDGE" },
  { id: "site-11", title: "React Aria", meta: "components•a11y", clicks: 87, category: "RESOURCES" },
  { id: "site-12", title: "Arcory Internal Board", meta: "project•tracking", clicks: 36, category: "PROJECT" },
];

function SavedSiteRow({ site }: { site: SavedSite }) {
  return (
    <div className="group flex items-center gap-2 rounded-sm px-1 py-3 text-xs transition-colors duration-150 hover:bg-muted/50">
      <div className="flex items-center justify-center text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
        &gt;
      </div>
      <IdenticonAvatar
        alt={`${site.title} identicon`}
        className="size-5"
        monoChroma={0.08}
        monoLightnessHigh={0.8}
        monoLightnessLow={0.35}
        seed={site.title}
        size={20}
      />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4 pl-0">
        <div className="min-w-0">
          <p className="truncate text-foreground">{site.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {site.meta.split("•").map((item, index) => (
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
    </div>
  );
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [keyword, setKeyword] = useState("");
  const buttonRefs = useRef<Partial<Record<Category, HTMLButtonElement | null>>>({});

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<Category, number>;
    counts.ALL = savedSites.length;

    for (const site of savedSites) {
      counts[site.category] += 1;
    }

    return counts;
  }, []);

  const filteredSites = useMemo(() => {
    const searchValue = keyword.trim().toLowerCase();

    return savedSites.filter((site) => {
      const categoryMatched = activeCategory === "ALL" || site.category === activeCategory;
      const keywordMatched = !searchValue || site.title.toLowerCase().includes(searchValue);

      return categoryMatched && keywordMatched;
    });
  }, [activeCategory, keyword]);

  const switchCategoryByArrow = (current: Category, direction: 1 | -1) => {
    const currentIndex = categories.indexOf(current);
    if (currentIndex === -1 || categories.length <= 1) return;

    const nextIndex = (currentIndex + direction + categories.length) % categories.length;
    const nextCategory = categories[nextIndex];

    setActiveCategory(nextCategory);
    buttonRefs.current[nextCategory]?.focus();
  };

  const isCategoryEmpty =
    activeCategory !== "ALL" && categoryCounts[activeCategory] === 0 && keyword.trim().length === 0;

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-12 sm:px-[70px]">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[768px] flex-col bg-card px-6 py-10 sm:px-16 sm:py-16">
        <header className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-foreground">
            <span className="text-[10px]">▲</span>
            <span>Arcory</span>
          </div>
          <a className="text-foreground" href="#">
            About
          </a>
        </header>

        <section className="mt-12 flex justify-center">
          <HeroAsciiGrid />
        </section>

        <section className="mt-9">
          <div
            aria-label="Site categories"
            className="flex flex-wrap items-center gap-2 text-[13px] text-foreground"
            role="tablist"
          >
            {categories.map((category) => (
              <button
                aria-selected={activeCategory === category}
                className={cn(
                  "rounded-sm px-1.5 py-1 leading-none transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground",
                  activeCategory === category &&
                    "bg-foreground text-background hover:bg-foreground/90 hover:text-background active:text-background",
                )}
                key={category}
                onClick={() => setActiveCategory(category)}
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

          <Input
            aria-label="Search saved websites"
            className="mt-3 mb-1 h-8 rounded-none border-input bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
            placeholder="Search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />

          <div className="mt-1">
            {isCategoryEmpty ? (
              <ListEmptyState category={activeCategory} mode="category" />
            ) : filteredSites.length > 0 ? (
              filteredSites.map((site) => <SavedSiteRow key={site.id} site={site} />)
            ) : (
              <ListEmptyState category={activeCategory} mode="search" />
            )}
          </div>

          <div className="py-4 text-center text-xs uppercase tracking-[0.06em] text-foreground">
            {filteredSites.length} Saves
          </div>
        </section>

        <footer className="mt-auto">
          <div className="flex items-center gap-4 pt-9 pb-0">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs uppercase tracking-[0.06em] text-foreground">Archive + story</p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </footer>
      </main>
    </div>
  );
}
