"use client";

import { RetrievedChunk } from "@/utils/types";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface EvidenceDisplayProps {
  evidence: RetrievedChunk[];
}

export function EvidenceDisplay({ evidence }: EvidenceDisplayProps) {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  const toggleExpand = (chunkId: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  if (evidence.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-surface border border-subtle text-center text-muted text-sm">
        No evidence retrieved
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {evidence.map((chunk) => {
        const isExpanded = expandedChunks.has(chunk.chunk_id);
        return (
          <div
            key={chunk.chunk_id}
            className="p-4 rounded-xl bg-surface border border-subtle"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-indigo" />
                <span className="text-sm font-medium text-primary">{chunk.source_document}</span>
                {chunk.page_number && (
                  <span className="text-xs text-muted">Page {chunk.page_number}</span>
                )}
              </div>
              <button
                onClick={() => toggleExpand(chunk.chunk_id)}
                className="p-1 rounded hover:bg-hover transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted" />
                )}
              </button>
            </div>

            <p
              className={`text-sm text-secondary leading-relaxed ${
                !isExpanded ? "line-clamp-2" : ""
              }`}
            >
              {chunk.text}
            </p>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Relevance:</span>
                <div className="w-24 h-1.5 bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-indigo transition-all"
                    style={{ width: `${chunk.retrieval_score * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted">
                  {(chunk.retrieval_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
