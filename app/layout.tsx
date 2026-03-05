import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcory | Curated Feed",
  description:
    "A curated library for websites, articles, plugins, and real-world cases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
