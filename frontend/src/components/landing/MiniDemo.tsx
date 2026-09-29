"use client";

import { motion } from "framer-motion";
import { ArrowRight, MessageSquare } from "lucide-react";
import Link from "next/link";

const exampleQueries = [
  "What does the ABS warning indicate?",
  "Compare the fuel efficiency of the X5 and X7 models",
  "List three safety features and explain how they work",
];

export function MiniDemo() {
  return (
    <section className="py-24 border-t border-subtle bg-surface/50">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Try the <span className="bg-gradient-brand bg-clip-text text-transparent">Demo</span>
          </h2>
          <p className="text-secondary max-w-2xl mx-auto">
            Experience streaming RAG with real-time telemetry and evidence visualization.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto"
        >
          <div className="p-6 rounded-xl bg-surface border border-subtle inner-highlight">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-brand-indigo/10 text-brand-indigo flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Interactive Demo</h3>
                <p className="text-sm text-secondary">Stream answers in real-time</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {exampleQueries.map((query, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-elevated border border-subtle text-sm text-secondary"
                >
                  "{query}"
                </div>
              ))}
            </div>

            <Link
              href="/demo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-brand text-white font-medium hover:opacity-90 transition-opacity"
            >
              Try Full Demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
