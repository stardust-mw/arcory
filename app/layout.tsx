import type { Metadata } from "next";
import localFont from "next/font/local";

import { SiteModeProvider } from "@/components/site-mode-provider";
import { SITE_MODE_PENDING_SHORTCUT_KEY, SITE_MODE_SHORTCUT_KEYS } from "@/lib/site-mode";

import "./globals.css";

const fragmentMono = localFont({
  src: "./fonts/FragmentMono-Regular.ttf",
  variable: "--font-fragment-mono",
  display: "swap",
});

const pendingShortcutBootstrap = `
  (() => {
    const storageKey = ${JSON.stringify(SITE_MODE_PENDING_SHORTCUT_KEY)};
    const shortcutKeys = new Set(${JSON.stringify(SITE_MODE_SHORTCUT_KEYS)});
    const shouldIgnoreTarget = (target) => {
      if (!target) return false;
      if (target.isContentEditable) return true;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };

    window.addEventListener("keydown", (event) => {
      if (document.documentElement.dataset.arcoryHydrated === "true") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreTarget(event.target)) return;

      const key = String(event.key || "").toLowerCase();
      if (!shortcutKeys.has(key)) return;

      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ key, timestamp: Date.now() }));
      } catch {}
    });
  })();
`;

export const metadata: Metadata = {
  title: "Arcory",
  description: "Archive + story",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="arcory-mode-day" data-site-mode="day" lang="en" suppressHydrationWarning>
      <body className={`${fragmentMono.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: pendingShortcutBootstrap,
          }}
        />
        <SiteModeProvider>{children}</SiteModeProvider>
      </body>
    </html>
  );
}
