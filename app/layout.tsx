import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";

import { SiteModeProvider } from "@/components/site-mode-provider";

import "./globals.css";

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
      <body className={`${GeistMono.variable} antialiased`}>
        <SiteModeProvider>{children}</SiteModeProvider>
      </body>
    </html>
  );
}
