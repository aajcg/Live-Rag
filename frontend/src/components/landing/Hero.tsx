"use client";

import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Aurora background */}
      <div className="absolute inset-0 bg-aurora opacity-50 dark:opacity-100" />

      {/* Dot grid pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--bg-base)_70%)]">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-24 text-center">

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            letterSpacing: "-0.03em",
          }}
        >
          Real-Time RAG for{" "}
          <span className="bg-gradient-brand bg-clip-text text-transparent">
            Live Conversations
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Streaming retrieval with multi-intent decomposition, early provisional
          answers, and delta refinement.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/demo"
            className="group relative px-6 py-3 rounded-lg bg-gradient-brand text-white font-medium overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-brand opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative flex items-center gap-2">
              Try Demo
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
          <Link
            href="/api-docs"
            className="px-6 py-3 rounded-lg border border-subtle hover:bg-hover transition-colors font-medium"
          >
            View API Docs
          </Link>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-muted"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-indigo" />
            <span>100% Benchmark Scores</span>
          </div>
          <span className="text-border">•</span>
          <span>Offline-First</span>
          <span className="text-border">•</span>
          <span>Grounded Citations</span>
        </motion.div>
      </div>
    </section>
  );
}
