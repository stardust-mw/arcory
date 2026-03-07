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

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
      applyTheme(savedTheme);
      return;
    }

    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(preferredTheme);
    applyTheme(preferredTheme);
  }, []);

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
        applyTheme(nextTheme);
        localStorage.setItem(STORAGE_KEY, nextTheme);
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
