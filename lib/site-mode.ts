export const SITE_MODES = ["day", "night", "summer", "midnight", "rain"] as const;

export type SiteMode = (typeof SITE_MODES)[number];
export type SiteModeShortcutKey = "d" | "s" | "n" | "m" | "r" | "c";

export const SITE_MODE_STORAGE_KEY = "arcory-site-mode";
export const SITE_MODE_PENDING_SHORTCUT_KEY = "arcory-pending-shortcut";
export const SITE_MODE_PENDING_SHORTCUT_MAX_AGE_MS = 3000;

export const SITE_MODE_SHORTCUT_KEYS: SiteModeShortcutKey[] = ["d", "s", "n", "m", "r", "c"];

export const SITE_MODE_SHORTCUT_TO_MODE = {
  d: "day",
  s: "summer",
  n: "night",
  m: "midnight",
  r: "rain",
} as const satisfies Record<Exclude<SiteModeShortcutKey, "c">, SiteMode>;

export const SITE_MODE_CLASS_BY_MODE: Record<SiteMode, string> = {
  day: "arcory-mode-day",
  night: "arcory-mode-night",
  summer: "arcory-mode-summer",
  midnight: "arcory-mode-midnight",
  rain: "arcory-mode-rain",
};

export const SITE_MODE_CLASSES = ["dark", ...Object.values(SITE_MODE_CLASS_BY_MODE)];

export type SiteModeAtmosphereConfig = {
  className: string;
  mode: Extract<SiteMode, "summer" | "midnight" | "rain">;
  notes: string;
  src: string;
};

export const SITE_MODE_ATMOSPHERES: SiteModeAtmosphereConfig[] = [
  {
    mode: "summer",
    src: "/leaves.mp4",
    className: "arcory-summer-overlay",
    notes: "Light base mode with multiply-blended foliage and light flicker.",
  },
  {
    mode: "midnight",
    src: "/moon.mp4",
    className: "arcory-midnight-overlay",
    notes: "Dark base mode that relies on opacity instead of blend modes to preserve contrast.",
  },
  {
    mode: "rain",
    src: "/rain.mp4",
    className: "arcory-rain-overlay",
    notes: "Light base mode with multiply-blended rain texture kept above the background but under readability-critical contrast.",
  },
];

export function isSiteMode(value: string | null): value is SiteMode {
  return SITE_MODES.includes(value as SiteMode);
}

export function isDarkFamilyMode(mode: SiteMode) {
  return mode === "night" || mode === "midnight";
}

export function getModeFromShortcut(key: string | null | undefined): SiteMode | null {
  if (!key) return null;
  const normalized = key.toLowerCase();
  if (normalized === "c") return null;
  return SITE_MODE_SHORTCUT_TO_MODE[normalized as keyof typeof SITE_MODE_SHORTCUT_TO_MODE] ?? null;
}

export function getInitialSiteMode(): SiteMode {
  if (typeof window === "undefined") return "day";

  const savedMode = window.localStorage.getItem(SITE_MODE_STORAGE_KEY);
  if (isSiteMode(savedMode)) return savedMode;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

export function applySiteMode(mode: SiteMode, root: HTMLElement = document.documentElement) {
  root.classList.remove(...SITE_MODE_CLASSES);
  root.classList.add(SITE_MODE_CLASS_BY_MODE[mode]);
  root.classList.toggle("dark", isDarkFamilyMode(mode));
  root.dataset.siteMode = mode;
}
