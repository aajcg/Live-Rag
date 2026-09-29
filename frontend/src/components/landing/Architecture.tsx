"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

const stages = [
  { name: "Transcript Stream", description: "Live chunked input" },
  { name: "Controller", description: "WAIT / RETRIEVE / SUPPRESS" },
  { name: "Decomposer", description: "Multi-intent split" },
  { name: "Parallel Retrieval", description: "Dense + BM25" },
  { name: "RRF Fusion", description: "Reciprocal rank fusion" },
  { name: "Reranker", description: "Cross-encoder" },
  { name: "Evidence Selection", description: "Balanced top-K" },
  { name: "Synthesis", description: "Grounded answer" },
];

export function Architecture() {
  return (
    <section id="architecture" className="py-24 border-t border-subtle bg-surface/50">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Pipeline <span className="bg-gradient-brand bg-clip-text text-transparent">Architecture</span>
          </h2>
          <p className="text-secondary max-w-2xl mx-auto">
            Event-driven orchestration from transcript to grounded answer.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stages.map((stage, index) => (
              <motion.div
                key={stage.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative group"
              >
                <div className="relative p-6 rounded-xl bg-surface border border-subtle inner-highlight hover:shadow-glow transition-all hover:-translate-y-1">
                  <div className="text-sm font-mono text-muted mb-2">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{stage.name}</h3>
                  <p className="text-sm text-secondary">{stage.description}</p>
                  
                  {/* Arrow on desktop */}
                  {index < stages.length - 1 && (
                    <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-border">
                      <ChevronRight className="w-6 h-6" />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
