import Link from "next/link";

import { AboutCosmosAnimation } from "@/components/about-cosmos-animation";
import { AboutPortrait } from "@/components/about-portrait";
import { IdenticonAvatar } from "@/components/identicon-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function AboutPage() {
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

        <section className="mt-10 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">About Arcory</p>
          <AboutCosmosAnimation />
        </section>

        <section className="mt-10 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Project Notes</p>
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>
              Arcory 是一个面向创作者与开发者的收藏入口：聚合网站、文章、插件、案例，并提供结构化筛选与快速检索。
            </p>
            <p>
              这个版本最特别的地方是，它来自你和 AI 的第一次协作落地。
              从 0 到 1 的项目初始化、界面迭代、数据接入、分类策略和交互动效，都在同一个工程里连续完成。
            </p>
            <p className="text-muted-foreground">
              目标不是做“展示页”，而是做一个可持续维护、可持续增长的个人数字资产工作台。
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Portrait</p>
          <AboutPortrait className="w-full" />
          <p className="text-xs text-muted-foreground">
            使用 Web 压缩图（portrait.webp）展示人像，未找到图片时会自动回退到程序化像素版本。
          </p>
        </section>

        <footer className="mt-auto pt-10">
          <div className="flex items-center gap-4 pt-0 pb-0">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs uppercase tracking-[0.06em] text-foreground">Archive + story</p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </footer>
      </div>
    </main>
  );
}
