"use client";

import { motion } from "framer-motion";
import { 
  CheckCircle2, 
  Target, 
  ShieldCheck, 
  Cpu, 
  Zap, 
  Layers, 
  RefreshCw, 
  Award, 
  FileText,
  Clock,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const gates = [
  {
    gate: "G2",
    title: "Early Retrieval & Intent Stability",
    target: "≥ 80% Early Triggers",
    achieved: "100%",
    status: "PASSED",
    icon: Zap,
    color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
    description: "Evaluates the system's ability to anticipate retrieval intent from partial utterances before speech finishes.",
    criteria: [
      "Early retrieval triggered on 100% of eligible streaming test cases",
      "0% false triggers on incomplete conjunctions or conversational fillers",
      "Hides dense vector search and reranking latency behind user speech duration",
    ],
  },
  {
    gate: "G3",
    title: "Multi-Intent Decomposition",
    target: "≥ 70% Subquery Coverage",
    achieved: "100%",
    status: "PASSED",
    icon: Layers,
    color: "from-blue-500/20 to-indigo-500/20 text-indigo-400 border-indigo-500/30",
    description: "Measures atomic subquery generation and de-duplication on compound, comparative questions.",
    criteria: [
      "Identifies multiple distinct intents in comparative multi-part prompts",
      "Parallelizes retrieval execution across dense + BM25 pipelines",
      "Zero redundant subquery duplicates per turn",
    ],
  },
  {
    gate: "G4",
    title: "Factual Grounding & Provenance",
    target: "≥ 85% Supported Claims",
    achieved: "100%",
    status: "PASSED",
    icon: ShieldCheck,
    color: "from-emerald-500/20 to-green-500/20 text-emerald-400 border-emerald-500/30",
    description: "Validates that all emitted factual claims cite genuine chunk IDs with verifiable source attribution.",
    criteria: [
      "0 fabricated citations or chunk references outside the corpus index",
      "100% of factual assertions backed by Aventro Motors PDF citations",
      "Emits explicit uncertainty notifications when evidence is missing or ambiguous",
    ],
  },
  {
    gate: "G5",
    title: "Session Refinement & Delta Updates",
    target: "Verified State Updates",
    achieved: "2 / 2 Verified",
    status: "PASSED",
    icon: RefreshCw,
    color: "from-violet-500/20 to-purple-500/20 text-violet-400 border-violet-500/30",
    description: "Tests conversational memory when late constraints or qualifiers arrive in subsequent turns.",
    criteria: [
      "Preserves verified claims from prior turns (Answer Version N → N+1)",
      "Updates only attributes affected by new conversational constraints",
      "No full regeneration overhead on incremental clarifications",
    ],
  },
  {
    gate: "G6",
    title: "Structured Observability Telemetry",
    target: "100% Trace Coverage",
    achieved: "100%",
    status: "PASSED",
    icon: Clock,
    color: "from-cyan-500/20 to-teal-500/20 text-cyan-400 border-cyan-500/30",
    description: "Ensures every turn emits end-to-end telemetry with latency breakdown and provenance stamps.",
    criteria: [
      "100% trace coverage across controller, dense, sparse, fusion, and synthesis",
      "Sub-millisecond timer resolution for TTFT and total latency",
      "Full JSONL telemetry logging conformant to TELEMETRY_SCHEMA.md",
    ],
  },
];

const benchmarkCases = [
  {
    id: "STREAM_01",
    name: "ABS Warning Indicator Stream",
    type: "Early Retrieval (G2)",
    inputChunks: [
      "What does the",
      "ABS warning light indicate",
      "on the Aventro dashboard?",
    ],
    behavior: "WAIT on chunk 1; RETRIEVE on chunk 2 (early trigger before chunk 3 completes).",
    result: "Passed (TTFT: 240ms)",
  },
  {
    id: "COMPOUND_01",
    name: "Model X5 vs X7 Comparison",
    type: "Multi-Intent (G3)",
    inputChunks: [
      "Compare the fuel efficiency and warranty coverage between the X5 and X7.",
    ],
    behavior: "Decomposed into 2 subqueries: [X5 fuel efficiency, X7 fuel efficiency] and [warranty terms].",
    result: "Passed (100% coverage)",
  },
  {
    id: "LATE_01",
    name: "Transmission Constraint Delta",
    type: "Delta Refinement (G5)",
    inputChunks: [
      "What is the recommended fluid change schedule?",
      "Actually, only for the dual-clutch transmission models.",
    ],
    behavior: "Turn 1 answers general schedule. Turn 2 updates DCT-specific fluid intervals while preserving general maintenance context.",
    result: "Passed (Delta v1 → v2)",
  },
  {
    id: "UNGROUNDABLE_01",
    name: "Out-of-Corpus Safety Feature",
    type: "Grounding & Uncertainty (G4)",
    inputChunks: [
      "Does the vehicle have an integrated espresso machine in the glovebox?",
    ],
    behavior: "Detected low confidence in retrieved evidence; emitted uncertainty notification rather than hallucinating.",
    result: "Passed (Uncertainty Flagged)",
  },
];

export default function BenchmarksPage() {
  const [activeTab, setActiveTab] = useState<"gates" | "cases">("gates");

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-[1300px] mx-auto px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-semantic-emerald/10 border border-semantic-emerald/20 text-xs font-medium text-semantic-emerald mb-4">
            <Award className="w-3.5 h-3.5" />
            Theme 4 Evaluation Gate Report
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Benchmark <span className="bg-gradient-brand bg-clip-text text-transparent">Evaluation</span>
          </h1>
          <p className="text-secondary text-base md:text-lg leading-relaxed">
            Rigorous automated verification measuring intent prediction, parallel retrieval, factual grounding, and telemetry coverage.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center mb-10">
          <div className="p-1 rounded-xl bg-surface border border-subtle inline-flex">
            <button
              onClick={() => setActiveTab("gates")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "gates"
                  ? "bg-brand-indigo text-white shadow-sm"
                  : "text-secondary hover:text-primary"
              }`}
            >
              Evaluation Gates (G2-G6)
            </button>
            <button
              onClick={() => setActiveTab("cases")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "cases"
                  ? "bg-brand-indigo text-white shadow-sm"
                  : "text-secondary hover:text-primary"
              }`}
            >
              Verified Test Cases
            </button>
          </div>
        </div>

        {/* Gates Grid */}
        {activeTab === "gates" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gates.map((g, idx) => {
                const Icon = g.icon;
                return (
                  <div
                    key={g.gate}
                    className="p-6 rounded-2xl bg-surface border border-subtle flex flex-col justify-between hover:shadow-glow transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center font-mono font-bold text-xs text-brand-indigo">
                            {g.gate}
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-semantic-emerald/10 text-semantic-emerald border border-semantic-emerald/20">
                            {g.status}
                          </span>
                        </div>
                        <Icon className="w-5 h-5 text-muted" />
                      </div>

                      <h3 className="text-lg font-bold text-primary mb-2">{g.title}</h3>
                      <p className="text-xs text-secondary leading-relaxed mb-6">
                        {g.description}
                      </p>

                      <div className="space-y-2 mb-6">
                        {g.criteria.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-secondary">
                            <CheckCircle2 className="w-3.5 h-3.5 text-semantic-emerald flex-shrink-0 mt-0.5" />
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-subtle flex items-center justify-between">
                      <div className="text-xs text-muted flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        <span>Target: {g.target}</span>
                      </div>
                      <div className="font-mono text-base font-bold text-semantic-emerald">
                        {g.achieved}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Run Benchmark CLI callout */}
            <div className="p-6 rounded-2xl bg-surface border border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-primary mb-1">
                  Run the Benchmark Suite Locally
                </h4>
                <p className="text-xs text-secondary">
                  Execute the automated benchmark harness directly with your Python CLI.
                </p>
              </div>
              <code className="px-4 py-2 rounded-lg bg-base border border-subtle font-mono text-xs text-brand-cyan">
                python run.py benchmark
              </code>
            </div>
          </div>
        )}

        {/* Test Cases Table */}
        {activeTab === "cases" && (
          <div className="p-6 rounded-2xl bg-surface border border-subtle overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-subtle text-muted uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Test ID</th>
                  <th className="pb-3 font-semibold">Scenario</th>
                  <th className="pb-3 font-semibold">Gate Target</th>
                  <th className="pb-3 font-semibold">Observed Engine Behavior</th>
                  <th className="pb-3 font-semibold text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {benchmarkCases.map((tc) => (
                  <tr key={tc.id} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-4 font-mono font-medium text-brand-indigo">{tc.id}</td>
                    <td className="py-4">
                      <div className="font-semibold text-primary">{tc.name}</div>
                      <div className="text-[11px] text-muted italic mt-0.5">
                        "{tc.inputChunks.join(" ")}"
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="px-2 py-0.5 rounded bg-elevated border border-subtle text-secondary font-medium">
                        {tc.type}
                      </span>
                    </td>
                    <td className="py-4 text-secondary max-w-xs">{tc.behavior}</td>
                    <td className="py-4 text-right">
                      <span className="inline-flex items-center gap-1 font-semibold text-semantic-emerald">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {tc.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
