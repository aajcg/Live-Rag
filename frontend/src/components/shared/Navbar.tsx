"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Github, Zap } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/utils/utils";

const navItems = [
  { name: "Demo", href: "/demo" },
  { name: "Architecture", href: "/architecture" },
  { name: "Benchmarks", href: "/benchmarks" },
  { name: "Telemetry", href: "/telemetry" },
  { name: "API Docs", href: "/api-docs" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-subtle"
    >
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Zap className="w-6 h-6 text-brand-indigo" />
            <div className="absolute inset-0 bg-brand-indigo blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Live RAG</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "relative px-4 py-2 text-sm text-secondary hover:text-primary transition-colors",
                  isActive && "text-primary font-medium"
                )}
              >
                {item.name}
                {isActive && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-indigo"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-elevated border border-subtle hover:bg-hover transition-colors"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5 text-muted" />
          </Link>
          <ThemeToggle />
          <Link
            href="/demo"
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-white bg-gradient-brand rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            Open Demo
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
