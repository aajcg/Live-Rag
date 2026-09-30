"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface EvidenceChunk {
  chunk_id: string;
  text: string;
  source_file?: string;
  source_document?: string;
  document_title?: string;
  page_number?: number;
  retrieval_score: number;
}

interface EvidenceDisplayProps {
  evidence: EvidenceChunk[];
}

function getSourceName(chunk: EvidenceChunk): string {
  return (
    chunk.document_title ||
    chunk.source_document ||
    chunk.source_file ||
    chunk.chunk_id
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score * 100));
  const color =
    pct >= 70
      ? "bg-semantic-emerald"
      : pct >= 40
      ? "bg-brand-cyan"
      : "bg-semantic-amber";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-xs font-mono text-muted w-8 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export function EvidenceDisplay({ evidence }: EvidenceDisplayProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (evidence.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-subtle p-6 text-center text-muted text-sm">
        <FileText className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No evidence chunks retrieved
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted px-1 mb-3">
        {evidence.length} chunk{evidence.length !== 1 ? "s" : ""} retrieved
      </div>
      <AnimatePresence initial={false}>
        {evidence.map((chunk, i) => {
          const isExpanded = expandedIds.has(chunk.chunk_id);
          const sourceName = getSourceName(chunk);

          return (
            <motion.div
              key={chunk.chunk_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="border-b border-border-subtle last:border-0 overflow-hidden"
            >
              <button
                onClick={() => toggle(chunk.chunk_id)}
                className="w-full py-3 text-left hover:bg-black/5 transition-colors -mx-2 px-2 rounded"
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-brand-indigo mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-primary truncate">
                        {sourceName}
                      </span>
                      {chunk.page_number != null && (
                        <span className="text-[10px] text-muted font-mono whitespace-nowrap">
                          p.{chunk.page_number}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <ScoreBar score={chunk.retrieval_score} />
                    </div>
                    {!isExpanded && (
                      <p className="text-[11px] text-muted mt-1.5 line-clamp-2 leading-relaxed">
                        {chunk.text}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-1 text-muted">
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-2 pb-3">
                      <p className="text-xs text-text-secondary leading-relaxed mt-2 whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                      <div className="mt-2 pt-2 border-t border-border-subtle flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-muted">
                          {chunk.chunk_id}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
