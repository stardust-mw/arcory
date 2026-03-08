"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "arcory-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const savedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  if (window.document.documentElement.classList.contains("dark")) {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Button
      aria-label="Toggle theme"
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
        const nextTheme: Theme = theme === "dark" ? "light" : "dark";

        setTheme(nextTheme);
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
