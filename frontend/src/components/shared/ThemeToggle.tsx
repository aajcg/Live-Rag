"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/utils/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg bg-elevated border border-subtle hover:bg-hover transition-colors"
        aria-label="Toggle theme"
      >
        <Sun className="w-5 h-5 text-muted" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg bg-elevated border border-subtle hover:bg-hover transition-colors"
      aria-label="Toggle theme"
    >
      <Sun className="w-5 h-5 text-muted dark:hidden" />
      <Moon className="w-5 h-5 text-muted hidden dark:block" />
    </button>
  );
}
