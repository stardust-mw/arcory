"use client";

import { CloudRain, Moon, Sun } from "lucide-react";

import { useSiteMode } from "@/components/site-mode-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, toggleDayNight } = useSiteMode();
  const isDarkFamily = mode === "night" || mode === "midnight";
  const isWeatherMode = mode === "summer" || mode === "rain";
  const label = isDarkFamily ? "Switch to day mode (D)" : "Switch to night mode (N)";

  return (
    <Button
      aria-label={label}
      className={cn(
        "size-8 appearance-none rounded-none border-0 bg-transparent text-muted-foreground shadow-none transition-[color] duration-150",
        "cursor-pointer",
        "hover:bg-transparent hover:text-foreground active:bg-transparent active:text-foreground/80 focus-visible:bg-transparent",
        "dark:hover:bg-transparent dark:active:bg-transparent dark:focus-visible:bg-transparent",
        "dark:hover:text-foreground dark:active:text-foreground/80",
        "focus-visible:ring-0 focus-visible:border-transparent",
        className,
      )}
      onClick={() => {
        toggleDayNight();
      }}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {mode === "rain" ? (
        <CloudRain className="size-4" />
      ) : isDarkFamily ? (
        <Moon className="size-4" />
      ) : isWeatherMode ? (
        <CloudRain className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </Button>
  );
}
