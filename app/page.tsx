import {
  ArrowUpRight,
  BookmarkPlus,
  BookOpenText,
  BriefcaseBusiness,
  Filter,
  Flame,
  Globe,
  PlugZap,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ResourceType = "website" | "article" | "plugin" | "case";

type Resource = {
  id: string;
  type: ResourceType;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  score: number;
  tags: string[];
  url: string;
};

const resources: Resource[] = [
  {
    id: "r1",
    type: "website",
    title: "PageFlows",
    summary: "A swipeable archive of real onboarding and checkout flows from top apps.",
    source: "PageFlows",
    publishedAt: "2d ago",
    score: 96,
    tags: ["ux", "patterns", "benchmark"],
    url: "https://pageflows.com/",
  },
  {
    id: "r2",
    type: "article",
    title: "Designing Search as a Product Loop",
    summary: "Practical frameworks to turn search from utility into discovery engine.",
    source: "Lenny's Newsletter",
    publishedAt: "4d ago",
    score: 92,
    tags: ["search", "growth", "strategy"],
    url: "https://www.lennysnewsletter.com/",
  },
  {
    id: "r3",
    type: "plugin",
    title: "Shottr",
    summary: "Fast screenshot utility with pin, OCR and annotation for design handoff.",
    source: "shottr.cc",
    publishedAt: "6d ago",
    score: 89,
    tags: ["tooling", "productivity"],
    url: "https://shottr.cc/",
  },
  {
    id: "r4",
    type: "case",
    title: "Notion AI Onboarding Case Study",
    summary: "How progressive disclosure drove better activation than feature-first tours.",
    source: "Growth.Design",
    publishedAt: "1w ago",
    score: 95,
    tags: ["onboarding", "ai", "activation"],
    url: "https://growth.design/case-studies",
  },
  {
    id: "r5",
    type: "website",
    title: "Awwwards Collections",
    summary: "Curated interactions and visual systems from award-winning web experiences.",
    source: "Awwwards",
    publishedAt: "3d ago",
    score: 90,
    tags: ["inspiration", "motion"],
    url: "https://www.awwwards.com/",
  },
  {
    id: "r6",
    type: "plugin",
    title: "Raycast AI Commands",
    summary: "Automate repetitive product workflows with local command palettes.",
    source: "Raycast",
    publishedAt: "5d ago",
    score: 88,
    tags: ["automation", "workflow"],
    url: "https://www.raycast.com/",
  },
  {
    id: "r7",
    type: "article",
    title: "The Anatomy of Great Product Feeds",
    summary: "A breakdown of ranking, freshness, and trust signals for curation apps.",
    source: "Substack",
    publishedAt: "1d ago",
    score: 94,
    tags: ["ranking", "feed", "data"],
    url: "https://substack.com/",
  },
  {
    id: "r8",
    type: "case",
    title: "Linear's Changelog Narrative",
    summary: "How concise release writing boosts feature adoption and perceived velocity.",
    source: "Linear Blog",
    publishedAt: "1w ago",
    score: 91,
    tags: ["release", "communication"],
    url: "https://linear.app/blog",
  },
];

const typeMeta: Record<
  ResourceType,
  { label: string; icon: LucideIcon; className: string }
> = {
  website: {
    label: "Website",
    icon: Globe,
    className: "border-sky-300/70 bg-sky-400/10 text-sky-700",
  },
  article: {
    label: "Article",
    icon: BookOpenText,
    className: "border-teal-300/70 bg-teal-400/10 text-teal-700",
  },
  plugin: {
    label: "Plugin",
    icon: PlugZap,
    className: "border-amber-300/80 bg-amber-400/10 text-amber-700",
  },
  case: {
    label: "Case",
    icon: BriefcaseBusiness,
    className: "border-orange-300/80 bg-orange-400/10 text-orange-700",
  },
};

const tabs = [
  { value: "all", label: "All" },
  { value: "website", label: "Websites" },
  { value: "article", label: "Articles" },
  { value: "plugin", label: "Plugins" },
  { value: "case", label: "Cases" },
] as const;

function resourceCount(tab: (typeof tabs)[number]["value"]) {
  if (tab === "all") return resources.length;
  return resources.filter((resource) => resource.type === tab).length;
}

function resourcesByTab(tab: (typeof tabs)[number]["value"]) {
  if (tab === "all") return resources;
  return resources.filter((resource) => resource.type === tab);
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-12 top-32 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a className="inline-flex items-center gap-2 font-semibold tracking-tight" href="#">
            <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              A
            </span>
            Arcory
          </a>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#">
              Discover
            </a>
            <a className="transition-colors hover:text-foreground" href="#">
              Collections
            </a>
            <a className="transition-colors hover:text-foreground" href="#">
              Submit
            </a>
          </nav>
          <Button size="sm">
            <BookmarkPlus />
            Save Feed
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="animate-rise-in rounded-3xl border border-border/80 bg-card/80 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-primary/90 text-primary-foreground">
              <Sparkles />
              Curated Feed
            </Badge>
            <Badge variant="outline">Topfeed-inspired visual baseline</Badge>
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Discover websites, articles, plugins, and product cases in one place.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            This is your project starter: built with Next.js + shadcn/ui and ready for
            expanding into submissions, collections, and personalized ranking.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant="outline">486 resources indexed</Badge>
            <Badge variant="outline">Daily refresh</Badge>
            <Badge variant="outline">4 content types</Badge>
            <Badge variant="outline">Keyboard-friendly navigation</Badge>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search resources"
                className="h-11 rounded-xl border-border/80 bg-background/90 pl-9"
                placeholder="Search by keyword, tag, tool, or source..."
              />
            </div>
            <Button className="h-11 rounded-xl px-5">
              <TrendingUp />
              Explore Now
            </Button>
            <Button className="h-11 rounded-xl px-5" size="sm" variant="outline">
              <Filter />
              Advanced
            </Button>
          </div>
        </section>

        <section className="mt-10">
          <Tabs className="gap-0" defaultValue="all">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <TabsList className="h-auto rounded-2xl p-1" variant="line">
                {tabs.map((tab) => (
                  <TabsTrigger
                    className="rounded-xl px-3 py-2 text-sm"
                    key={tab.value}
                    value={tab.value}
                  >
                    {tab.label}
                    <span className="ml-1 text-muted-foreground">({resourceCount(tab.value)})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button className="rounded-xl" size="sm" variant="ghost">
                <Flame />
                Trending this week
              </Button>
            </div>

            {tabs.map((tab) => (
              <TabsContent className="mt-6" key={tab.value} value={tab.value}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {resourcesByTab(tab.value).map((resource, index) => {
                    const meta = typeMeta[resource.type];
                    const Icon = meta.icon;

                    return (
                      <Card
                        className="animate-rise-in gap-4 border-border/75 bg-card/92 transition-all hover:-translate-y-1 hover:shadow-md"
                        key={resource.id}
                        style={{ animationDelay: `${index * 70}ms` }}
                      >
                        <CardHeader className="px-5 pb-0">
                          <div className="flex items-center justify-between gap-3">
                            <Badge className={meta.className} variant="outline">
                              <Icon />
                              {meta.label}
                            </Badge>
                            <span className="text-xs font-medium text-muted-foreground">
                              Score {resource.score}
                            </span>
                          </div>
                          <CardTitle className="text-xl leading-snug">{resource.title}</CardTitle>
                          <CardDescription className="text-sm leading-relaxed">
                            {resource.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-5">
                          <div className="flex flex-wrap gap-2">
                            {resource.tags.map((tag) => (
                              <Badge className="bg-muted/60 text-muted-foreground" key={tag} variant="secondary">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-border/70 px-5 pt-4 text-sm text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground">{resource.source}</p>
                            <p>{resource.publishedAt}</p>
                          </div>
                          <a href={resource.url} rel="noreferrer" target="_blank">
                            <Button className="rounded-lg" size="sm" variant="outline">
                              Visit
                              <ArrowUpRight />
                            </Button>
                          </a>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="animate-rise-in gap-3 border-border/70 bg-card/85" style={{ animationDelay: "120ms" }}>
            <CardHeader className="px-5">
              <CardTitle className="inline-flex items-center gap-2 text-lg">
                <Star className="size-4 text-amber-500" />
                Weekly picks pipeline
              </CardTitle>
              <CardDescription>
                Next step: connect your data source and auto-fill this section from Airtable, Notion, or Postgres.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 text-sm text-muted-foreground">
              - `items` table for resources and tags
              <br />- `collections` table for curated groups
              <br />- `votes` table for ranking and trend signals
            </CardContent>
          </Card>
          <Card className="animate-rise-in gap-3 border-border/70 bg-card/85" style={{ animationDelay: "220ms" }}>
            <CardHeader className="px-5">
              <CardTitle className="text-lg">Submission entrypoint</CardTitle>
              <CardDescription>
                Ready for an `/admin` form to submit and review new content.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <Button className="w-full rounded-xl">
                Submit a Resource
                <ArrowUpRight />
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
