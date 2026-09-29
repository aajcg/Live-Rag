"use client";

import { motion } from "framer-motion";
import { 
  GitBranch, 
  Cpu, 
  Database, 
  Layers, 
  ArrowRight, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  Radio, 
  FileCode2,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const pipelineStages = [
  {
    step: "01",
    title: "Transcript Ingestion & State Tracking",
    module: "src/memory.py & src/pipeline.py",
    icon: Radio,
    color: "from-blue-500/20 to-indigo-500/20 text-indigo-400 border-indigo-500/30",
    badge: "Input Stream",
    description: "Accepts incoming partial speech utterances with timestamps. Buffers chunks per-session and preserves context across conversation turns.",
    details: [
      "Per-session transcript history & context tracking",
      "Dynamic token buffering for speech-to-text streams",
      "Detection of conversational continuation vs turn completion",
    ],
  },
  {
    step: "02",
    title: "Retrieval Controller (Intent Stability)",
    module: "src/controller.py",
    icon: Cpu,
    color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
    badge: "Policy Gate",
    description: "Evaluates whether to WAIT (incomplete utterance), RETRIEVE (stable intent), or SUPPRESS (chit-chat / formatting request).",
    details: [
      "Calculates content words, entities, and numeric tokens",
      "Heuristic & LLM classification fallback with intent stability score (0.0 to 1.0)",
      "Triggers early provisional retrieval before speaker finishes",
    ],
  },
  {
    step: "03",
    title: "Multi-Intent Decomposition",
    module: "src/decomposer.py",
    icon: GitBranch,
    color: "from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30",
    badge: "Query Analysis",
    description: "Splits compound, multi-part questions into atomic, search-ready subqueries for parallel retrieval execution.",
    details: [
      "Isolates comparison dimensions (e.g. Model X vs Model Y)",
      "Per-intent de-duplication against active session memory",
      "Emits parallel asynchronous search tasks",
    ],
  },
  {
    step: "04",
    title: "Hybrid Dense & Sparse Retrieval",
    module: "src/retrieval.py",
    icon: Database,
    color: "from-cyan-500/20 to-teal-500/20 text-cyan-400 border-cyan-500/30",
    badge: "Corpus Search",
    description: "Executes ChromaDB dense vector search paired with BM25 keyword matching over the 133 Aventro Motors chunk index.",
    details: [
      "Dense: all-MiniLM-L6-v2 embeddings (384-dim)",
      "Sparse: BM25Okapi (k1=1.5, b=0.75) for precise model numbers & codes",
      "Page-aware chunk boundaries with 600-char window and 100-char overlap",
    ],
  },
  {
    step: "05",
    title: "Reciprocal Rank Fusion & Reranking",
    module: "src/retrieval.py",
    icon: Layers,
    color: "from-emerald-500/20 to-green-500/20 text-emerald-400 border-emerald-500/30",
    badge: "Ranking",
    description: "Merges ranked lists using RRF (k=60), then passes candidates through a ms-marco-MiniLM cross-encoder for deep semantic scoring.",
    details: [
      "RRF score: Σ 1 / (60 + rank_i)",
      "Cross-encoder reranking over top candidates",
      "Intent-balanced diversity selection to avoid duplicate documents",
    ],
  },
  {
    step: "06",
    title: "Grounded Synthesis & Delta Engine",
    module: "src/synthesis.py & src/memory.py",
    icon: RefreshCw,
    color: "from-violet-500/20 to-indigo-500/20 text-violet-400 border-violet-500/30",
    badge: "Generation",
    description: "Synthesizes answers strictly constrained to retrieved evidence. When late constraints arrive, refines affected claims while preserving verified ones.",
    details: [
      "Generates claim-level citation mappings (e.g. [chk_012])",
      "Emits uncertainty flags if confidence falls below threshold",
      "Increments Answer Version (v1 -> v2) with delta preservation",
    ],
  },
];

export default function ArchitecturePage() {
  const [selectedStage, setSelectedStage] = useState(0);

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-[1300px] mx-auto px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-xs font-medium text-brand-indigo mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Samsung PRISM Theme 4 Reference Architecture
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Pipeline <span className="bg-gradient-brand bg-clip-text text-transparent">Architecture</span>
          </h1>
          <p className="text-secondary text-base md:text-lg leading-relaxed">
            An event-driven streaming RAG system engineered for live conversations with sub-second time-to-first-token, multi-intent routing, and verifiable factual grounding.
          </p>
        </div>

        {/* High Level Flow Visualizer */}
        <div className="p-6 md:p-8 rounded-2xl bg-surface border border-subtle mb-16">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-primary">
            <Zap className="w-5 h-5 text-brand-indigo" />
            Event-Driven Architecture Overview
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {pipelineStages.map((stage, idx) => {
              const Icon = stage.icon;
              const isSelected = selectedStage === idx;
              return (
                <button
                  key={stage.step}
                  onClick={() => setSelectedStage(idx)}
                  className={`p-4 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? "bg-elevated border-brand-indigo shadow-glow scale-[1.02]"
                      : "bg-base/40 border-subtle hover:border-default hover:bg-elevated/50"
                  }`}
                >
                  <div className="text-[11px] font-mono font-semibold text-muted mb-2">
                    STAGE {stage.step}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-brand-indigo" />
                  </div>
                  <div className="text-xs font-semibold text-primary line-clamp-2 leading-tight mb-1">
                    {stage.title}
                  </div>
                  <span className="text-[10px] text-muted block line-clamp-1">
                    {stage.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Stage Detail Panel */}
          <div className="mt-8 p-6 rounded-xl bg-elevated/60 border border-subtle">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-subtle">
              <div>
                <span className="text-xs font-mono text-brand-indigo uppercase tracking-wider font-semibold">
                  Stage {pipelineStages[selectedStage].step} • {pipelineStages[selectedStage].badge}
                </span>
                <h3 className="text-xl font-bold text-primary mt-1">
                  {pipelineStages[selectedStage].title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-muted" />
                <code className="text-xs font-mono px-2.5 py-1 rounded bg-base text-secondary border border-subtle">
                  {pipelineStages[selectedStage].module}
                </code>
              </div>
            </div>

            <p className="text-secondary text-sm leading-relaxed my-4">
              {pipelineStages[selectedStage].description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {pipelineStages[selectedStage].details.map((detail, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-surface/80 border border-subtle text-xs text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-semantic-emerald flex-shrink-0 mt-0.5" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deep Dive Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Controller Decision Logic */}
          <div className="p-8 rounded-2xl bg-surface border border-subtle space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-semantic-amber/10 text-semantic-amber flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary">Controller State Machine</h3>
                <p className="text-xs text-muted">src/controller.py • Heuristic & Neural Policy</p>
              </div>
            </div>
            <p className="text-sm text-secondary leading-relaxed">
              In live speech, users hesitate, rephrase, or use conversational fillers. The controller executes continuous intent scoring before triggering expensive search tasks:
            </p>
            <div className="space-y-2.5 pt-2">
              <div className="p-3 rounded-lg bg-elevated border border-subtle flex items-start gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-semantic-amber/20 text-semantic-amber">
                  WAIT
                </span>
                <span className="text-xs text-secondary">
                  Trailing conjunctions (and, but, because), open utterances, or low entity density. Pauses search to accumulate speech tokens.
                </span>
              </div>
              <div className="p-3 rounded-lg bg-elevated border border-subtle flex items-start gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-brand-cyan/20 text-brand-cyan">
                  RETRIEVE
                </span>
                <span className="text-xs text-secondary">
                  Intent stability ≥ 0.65 or terminal punctuation. Dispatches parallel sparse/dense retrieval tasks immediately.
                </span>
              </div>
              <div className="p-3 rounded-lg bg-elevated border border-subtle flex items-start gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-semantic-rose/20 text-semantic-rose">
                  SUPPRESS
                </span>
                <span className="text-xs text-secondary">
                  Formatting requests ("bullet points", "summarize that") or conversational fillers. Answered from session memory without retrieval.
                </span>
              </div>
            </div>
          </div>

          {/* Delta Refinement & Memory */}
          <div className="p-8 rounded-2xl bg-surface border border-subtle space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-violet/10 text-brand-violet flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary">Session Memory & Delta Refinement</h3>
                <p className="text-xs text-muted">src/memory.py & src/synthesis.py</p>
              </div>
            </div>
            <p className="text-sm text-secondary leading-relaxed">
              When a speaker adds late specifications ("actually only for automatic transmission"), traditional RAG throws away the previous generation. Live RAG applies delta patches:
            </p>
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-elevated border border-subtle space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span>Delta Processing Flow</span>
                  <span className="text-brand-violet font-mono text-[11px]">v1 → v2</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <span className="px-2 py-1 rounded bg-surface border border-subtle">Prior Claims (v1)</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted" />
                  <span className="px-2 py-1 rounded bg-brand-violet/20 text-brand-violet font-medium">Late Detail Filter</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted" />
                  <span className="px-2 py-1 rounded bg-semantic-emerald/20 text-semantic-emerald font-medium">Refined Answer (v2)</span>
                </div>
                <p className="text-xs text-muted leading-normal pt-1">
                  Preserves verified claims, updates only conflicting attributes, and returns updated grounded citations without re-synthesizing unchanged portions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA to Demo */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-brand-indigo/10 via-purple-500/10 to-brand-cyan/10 border border-brand-indigo/30 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-primary mb-1">
              Experience the Pipeline in Real Time
            </h3>
            <p className="text-sm text-secondary">
              Test streaming retrieval, voice dictation, and claim grounding directly in the demo.
            </p>
          </div>
          <Link
            href="/demo"
            className="px-6 py-3 rounded-xl bg-gradient-brand text-white font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2 shadow-md flex-shrink-0"
          >
            Launch Interactive Demo
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
