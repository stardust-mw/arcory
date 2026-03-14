import Link from "next/link";

import { AboutCosmosLazy } from "@/components/about-cosmos-lazy";
import { AboutGalaxyGrid } from "@/components/about-galaxy-grid";
import { IdenticonAvatar } from "@/components/identicon-avatar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AboutPage() {
  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[768px] flex-col bg-card px-4 pt-8 pb-8 sm:px-16 sm:pt-9 sm:pb-16">
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
            <Link
              className="text-sm text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              href="/about"
            >
              About
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <section className="mt-10 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">About</p>
          <AboutCosmosLazy />
          <div className="pt-1">
            <div className="flex items-center justify-between border-b border-border/60 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <p>arcory // v0.1</p>
              <p>Human + AI</p>
            </div>

            <div className="mt-9 flex gap-4">
              <div aria-hidden className="hidden w-px shrink-0 self-stretch bg-border sm:block" />

              <div className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-10 sm:min-h-[600px]">
                <div className="space-y-6">
                  <div className="space-y-2 font-mono text-[16px] leading-7 tracking-[0.01em] text-foreground">
                    <p>Collect.</p>
                    <p>Explore.</p>
                    <p>Create.</p>
                  </div>

                  <div className="space-y-4 font-mono text-[13px] leading-7 text-foreground">
                    <div>
                        <p className="text-muted-foreground">&gt; collect</p>
                        <p>Place inspiration on one continuous timeline.</p>
                    </div>

                    <div>
                        <p className="text-muted-foreground">&gt; explore</p>
                        <p>Turn links into coordinates you can revisit.</p>
                    </div>

                    <div>
                        <p className="text-muted-foreground">&gt; create</p>
                        <p>Archive tools into sparks you can reignite.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 font-mono text-[13px] leading-7 text-foreground">
                    <p>Built with AI, tuned by human taste.</p>
                    <p>arcory, from 0 to 1, is ignition, not arrival.</p>
                  </div>

                  <p className="font-mono text-[13px] uppercase tracking-[0.12em] text-foreground">
                    arcory is a living archive.
                  </p>
                </div>

                <div className="mt-auto w-full space-y-1 text-[12px] text-muted-foreground">
                  <p>Reference</p>
                  <p>
                    Avatar:{" "}
                    <a
                      className="underline underline-offset-2 transition-colors hover:text-foreground"
                      href="https://identicon-prototype.labs.vercel.dev/"
                      rel="noreferrer"
                      target="_blank"
                    >
                      identicon-prototype.labs.vercel.dev
                    </a>
                  </p>
                  <p>
                    Hero ASCII:{" "}
                    <a
                      className="underline underline-offset-2 transition-colors hover:text-foreground"
                      href="https://hackathon.polar.sh/"
                      rel="noreferrer"
                      target="_blank"
                    >
                      hackathon.polar.sh
                    </a>
                  </p>
                </div>

                <section className="mt-0 w-full space-y-1">
                  <p className="text-[11px] tracking-[0.08em] text-muted-foreground">Hubble Ultra Deep Field</p>
                  <AboutGalaxyGrid className="w-full" />
                </section>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-auto">
          <div className="flex items-center gap-4 pt-8 pb-0 sm:pt-9">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs uppercase tracking-[0.06em] text-foreground">Archive + story</p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </footer>
      </div>
    </main>
  );
}
