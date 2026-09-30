"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal } from "lucide-react";
import type { PipelineEventLog } from "@/hooks/useRAGStream";

interface EventLogProps {
  events: PipelineEventLog[];
}

const TERMINAL_COLORS: Record<string, string> = {
  decision: "text-yellow-400",
  retrieval_started: "text-blue-400",
  provisional: "text-cyan-400",
  delta_retrieval: "text-purple-400",
  evidence: "text-green-400",
  claims: "text-indigo-400",
  uncertainty: "text-orange-400",
  ttft: "text-teal-400",
  complete: "text-emerald-400",
  error: "text-red-400",
};

const DEFAULT_COLOR = "text-gray-400";

function formatEventSummary(event: string, data: any): string {
  switch (event) {
    case "decision":
      return `[${data.decision}] STABILITY: ${((data.intent_stability ?? 0) * 100).toFixed(0)}% | TRIGGER: ${data.trigger ?? "N/A"} | REASON: ${data.reason}`;
    case "retrieval_started":
      return `SPAWNING ${((data.subqueries ?? []) as string[]).length} SUBQUERIES | MODE: ${data.mode ?? "N/A"}`;
    case "provisional":
      return `PROVISIONAL ANSWER EMITTED (v${data.answer_version ?? "N/A"})`;
    case "delta_retrieval":
      return `DELTA REFINEMENT TRIGGERED (v${data.answer_version ?? "N/A"})`;
    case "evidence":
      return `RETRIEVED ${data.count ?? 0} CHUNKS ACROSS ${(data.retrieval_events ?? []).length} SOURCES`;
    case "claims":
      return `EXTRACTED ${(data.claims ?? []).length} CLAIMS`;
    case "uncertainty":
      return `UNCERTAINTY DETECTED: ${data.message ?? ""}`;
    case "ttft":
      return `TIME-TO-FIRST-TOKEN: ${(data.ttft_ms ?? 0).toFixed(0)}ms`;
    case "complete":
      return `TURN COMPLETE | VERSION: v${data.answer_version ?? "N/A"} | CITATIONS: ${(data.citations ?? []).length}`;
    case "error":
      return `FATAL ERROR: ${data.error ?? "Unknown error"}`;
    default:
      return JSON.stringify(data).slice(0, 100);
  }
}

function padEnd(str: string, length: number) {
  if (str.length >= length) return str;
  return str + " ".repeat(length - str.length);
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="rounded-xl bg-[#0D1117] border border-gray-800 overflow-hidden shadow-2xl font-mono text-[11px] sm:text-xs">
      {/* Terminal Header */}
      <div className="flex items-center px-4 py-2 bg-[#161B22] border-b border-gray-800">
        <div className="flex gap-1.5 mr-4">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        </div>
        <Terminal className="w-4 h-4 text-gray-400 mr-2" />
        <span className="text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
          Pipeline Event Stream
        </span>
        <span className="ml-auto text-gray-500">
          {events.length} events
        </span>
      </div>

      {/* Terminal Body */}
      <div className="p-4 h-48 sm:h-64 overflow-y-auto bg-black text-gray-300 space-y-1.5 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        {events.length === 0 ? (
          <div className="text-gray-600 animate-pulse">
            &gt; Waiting for pipeline events...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((entry) => {
              const colorClass = TERMINAL_COLORS[entry.event] ?? DEFAULT_COLOR;
              const timestamp = new Date(entry.timestamp).toISOString().split('T')[1].slice(0, 12);
              
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-3 leading-relaxed hover:bg-white/5 px-1 -mx-1 rounded"
                >
                  <span className="text-gray-600 flex-shrink-0">[{timestamp}]</span>
                  <span className={`font-bold flex-shrink-0 w-32 ${colorClass}`}>
                    {padEnd(entry.event.toUpperCase(), 16)}
                  </span>
                  <span className="text-gray-300 break-words flex-1">
                    {formatEventSummary(entry.event, entry.data)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
