export const SITE_MODES = ["day", "night", "summer", "midnight", "rain"] as const;

export type SiteMode = (typeof SITE_MODES)[number];
export type SiteModeShortcutKey = "d" | "s" | "n" | "m" | "r" | "c";

export const SITE_MODE_STORAGE_KEY = "arcory-site-mode";
export const SITE_MODE_PENDING_SHORTCUT_KEY = "arcory-pending-shortcut";
export const SITE_MODE_PENDING_SHORTCUT_MAX_AGE_MS = 3000;
const SITE_MODE_WEATHER_REQUEST_TIMEOUT_MS = 5000;

type SiteModeManualOverride = {
  expiresAt: number;
  mode: SiteMode;
};

type SiteModeWeatherSignal = {
  isDay?: boolean;
  precipitation?: number;
  temperature?: number;
  weatherCode?: number;
};

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

export function getTimeBasedSiteMode(date = new Date()): SiteMode {
  const hour = date.getHours();

  if (hour >= 22 || hour < 5) return "midnight";
  if (hour >= 18 || hour < 7) return "night";
  return "day";
}

function getNextDayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function saveManualSiteMode(mode: SiteMode, date = new Date()) {
  if (typeof window === "undefined") return;

  const payload: SiteModeManualOverride = {
    expiresAt: getNextDayStart(date),
    mode,
  };

  window.localStorage.setItem(SITE_MODE_STORAGE_KEY, JSON.stringify(payload));
}

export function clearManualSiteMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SITE_MODE_STORAGE_KEY);
}

export function getActiveManualSiteMode(date = new Date()): SiteMode | null {
  if (typeof window === "undefined") return null;

  const rawValue = window.localStorage.getItem(SITE_MODE_STORAGE_KEY);
  if (!rawValue) return null;

  if (isSiteMode(rawValue)) {
    saveManualSiteMode(rawValue, date);
    return rawValue;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SiteModeManualOverride>;
    const mode = parsed.mode ?? null;

    if (!isSiteMode(mode) || typeof parsed.expiresAt !== "number") {
      clearManualSiteMode();
      return null;
    }

    if (parsed.expiresAt <= date.getTime()) {
      clearManualSiteMode();
      return null;
    }

    return mode;
  } catch {
    clearManualSiteMode();
    return null;
  }
}

function isRainyWeatherCode(weatherCode: number) {
  return (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 71 && weatherCode <= 77) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    (weatherCode >= 85 && weatherCode <= 86) ||
    (weatherCode >= 95 && weatherCode <= 99)
  );
}

function isBrightWeatherCode(weatherCode: number) {
  return weatherCode >= 0 && weatherCode <= 2;
}

export function getAdaptiveSiteModeFromSignal(signal: SiteModeWeatherSignal, date = new Date()): SiteMode {
  const timeMode = getTimeBasedSiteMode(date);
  const hour = date.getHours();

  if (typeof signal.weatherCode === "number" && isRainyWeatherCode(signal.weatherCode)) {
    return hour >= 7 && hour < 21 ? "rain" : timeMode;
  }

  if (timeMode === "midnight") {
    return signal.isDay === false && typeof signal.weatherCode === "number" && isBrightWeatherCode(signal.weatherCode)
      ? "midnight"
      : "night";
  }

  if (timeMode === "night") {
    return "night";
  }

  const isWarm = typeof signal.temperature === "number" && signal.temperature >= 22;
  const isBright = typeof signal.weatherCode === "number" && isBrightWeatherCode(signal.weatherCode);
  const isDry = typeof signal.precipitation !== "number" || signal.precipitation <= 0.2;

  if (isWarm && isBright && isDry) {
    return "summer";
  }

  return "day";
}

function getCurrentPosition() {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve<GeolocationPosition | null>(null);
  }

  return new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 30,
        timeout: SITE_MODE_WEATHER_REQUEST_TIMEOUT_MS,
      },
    );
  });
}

async function fetchWeatherSignal(latitude: number, longitude: number): Promise<SiteModeWeatherSignal | null> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "weather_code,temperature_2m,is_day,precipitation",
    forecast_days: "1",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`);
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    current?: {
      is_day?: number;
      precipitation?: number;
      temperature_2m?: number;
      weather_code?: number;
    };
  };

  if (!payload.current) return null;

  return {
    isDay: payload.current.is_day === 1,
    precipitation: payload.current.precipitation,
    temperature: payload.current.temperature_2m,
    weatherCode: payload.current.weather_code,
  };
}

export async function resolveAdaptiveSiteMode(date = new Date()): Promise<SiteMode> {
  const position = await getCurrentPosition();
  if (!position) return getTimeBasedSiteMode(date);

  try {
    const signal = await fetchWeatherSignal(position.coords.latitude, position.coords.longitude);
    if (!signal) return getTimeBasedSiteMode(date);
    return getAdaptiveSiteModeFromSignal(signal, date);
  } catch {
    return getTimeBasedSiteMode(date);
  }
}

export function applySiteMode(mode: SiteMode, root: HTMLElement = document.documentElement) {
  root.classList.remove(...SITE_MODE_CLASSES);
  root.classList.add(SITE_MODE_CLASS_BY_MODE[mode]);
  root.classList.toggle("dark", isDarkFamilyMode(mode));
  root.dataset.siteMode = mode;
}
