import Link from "next/link";
import { Github, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-subtle bg-surface">
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-indigo" />
            <span className="font-semibold text-primary">Live RAG Engine</span>
            <span className="text-xs text-muted ml-2">Samsung PRISM Theme 4</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-secondary">
            <Link href="/demo" className="hover:text-primary transition-colors">
              Live Demo
            </Link>
            <Link href="/architecture" className="hover:text-primary transition-colors">
              Architecture
            </Link>
            <Link href="/benchmarks" className="hover:text-primary transition-colors">
              Benchmarks
            </Link>
            <Link href="/telemetry" className="hover:text-primary transition-colors">
              Telemetry
            </Link>
            <Link href="/api-docs" className="hover:text-primary transition-colors">
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
          </div>

          <div className="flex items-center gap-3 text-xs text-muted font-mono">
            <span>Next.js 14</span>
            <span>•</span>
            <span>FastAPI</span>
            <span>•</span>
            <span>SSE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
