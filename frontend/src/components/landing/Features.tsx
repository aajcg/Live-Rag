"use client";

import { motion } from "framer-motion";
import { 
  Zap, 
  GitBranch, 
  RefreshCw, 
  Database, 
  CheckCircle, 
  WifiOff 
} from "lucide-react";
import { useRef, useState } from "react";

const features = [
  {
    icon: Zap,
    title: "Early Retrieval",
    description: "Provisional answers issued before utterance completion, hiding latency behind user speech time.",
    color: "text-brand-amber",
    bgColor: "bg-brand-amber/10",
  },
  {
    icon: GitBranch,
    title: "Multi-Intent Decomposition",
    description: "Break compound queries into atomic subqueries with intelligent de-duplication.",
    color: "text-brand-indigo",
    bgColor: "bg-brand-indigo/10",
  },
  {
    icon: RefreshCw,
    title: "Delta Refinement",
    description: "Incremental answer updates as late details arrive, preserving prior claims.",
    color: "text-brand-cyan",
    bgColor: "bg-brand-cyan/10",
  },
  {
    icon: Database,
    title: "Hybrid Retrieval",
    description: "Dense + BM25 with RRF fusion and cross-encoder reranking for optimal relevance.",
    color: "text-brand-violet",
    bgColor: "bg-brand-violet/10",
  },
  {
    icon: CheckCircle,
    title: "Grounded Answers",
    description: "Every claim backed by corpus citations with verifiable source references.",
    color: "text-semantic-emerald",
    bgColor: "bg-semantic-emerald/10",
  },
  {
    icon: WifiOff,
    title: "Offline-First",
    description: "Full functionality without API keys or network connectivity.",
    color: "text-secondary",
    bgColor: "bg-elevated",
  },
];

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseMove={handleMouseMove}
      className="spotlight-card group relative p-6 rounded-xl bg-surface border border-subtle inner-highlight hover:shadow-glow-hover transition-shadow"
      style={{
        "--mouse-x": `${mousePos.x}px`,
        "--mouse-y": `${mousePos.y}px`,
      } as React.CSSProperties}
    >
      <div
        className={`w-12 h-12 rounded-lg ${feature.bgColor} ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
      >
        <feature.icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
      <p className="text-sm text-secondary leading-relaxed">{feature.description}</p>
    </motion.div>
  );
}

export function Features() {
  return (
    <section id="features" className="py-24 border-t border-subtle">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Engineered for <span className="bg-gradient-brand bg-clip-text text-transparent">Real-Time</span>
          </h2>
          <p className="text-secondary max-w-2xl mx-auto">
            A complete streaming RAG pipeline designed for live conversation scenarios.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
