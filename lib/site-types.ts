export const siteCategories = [
  "COMPONENTS",
  "DESIGN",
  "INSPIRATION",
  "KNOWLEDGE",
  "PROJECT",
  "RESOURCES",
  "SYSTEM",
] as const;

export type SiteCategory = (typeof siteCategories)[number];
export type Category = "ALL" | SiteCategory;

export type SavedSite = {
  id: string;
  title: string;
  meta: string;
  clicks: number;
  category: SiteCategory;
  subcategory?: string;
  url?: string;
  source?: "local" | "notion";
  updatedAt?: string;
};

export const categories: Category[] = [
  "ALL",
  ...[...siteCategories].sort((a, b) => a.localeCompare(b, "en")),
];

export const categorySet = new Set<SiteCategory>(siteCategories);
