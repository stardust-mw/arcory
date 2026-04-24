import type { Metadata } from "next";
import localFont from "next/font/local";

import { SiteModeProvider } from "@/components/site-mode-provider";

import "./globals.css";

const fragmentMono = localFont({
  src: "./fonts/FragmentMono-Regular.ttf",
  variable: "--font-fragment-mono",
  display: "swap",
});

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
    <html className="arcory-mode-day" data-site-mode="day" lang="en">
      <body className={`${fragmentMono.variable} antialiased`}>
        <SiteModeProvider>{children}</SiteModeProvider>
      </body>
    </html>
  );
}
