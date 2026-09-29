import Link from "next/link";
import { Github, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-subtle bg-surface">
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-indigo" />
            <span className="font-semibold">Live RAG</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-secondary">
            <Link
              href="/api-docs"
              className="hover:text-primary transition-colors"
            >
              API Docs
            </Link>
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              GitHub
            </Link>
            <span className="text-muted">MIT License</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted">
            <span>Next.js 14</span>
            <span>•</span>
            <span>TypeScript</span>
            <span>•</span>
            <span>TailwindCSS</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
