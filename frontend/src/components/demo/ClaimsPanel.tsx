"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Shield } from "lucide-react";

interface Claim {
  text: string;
  grounded: boolean;
  chunk_ids?: string[];
  chunk_id?: string;
  support_score?: number;
  updated?: boolean;
}

interface ClaimsPanelProps {
  claims: Claim[];
  isDelta?: boolean;
}

export function ClaimsPanel({ claims, isDelta }: ClaimsPanelProps) {
  if (claims.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-subtle p-4 text-center text-muted text-sm flex items-center justify-center gap-2 h-24">
        <Shield className="w-4 h-4 opacity-30" />
        <span>Grounded claims will appear here</span>
      </div>
    );
  }

  const grounded = claims.filter((c) => c.grounded).length;
  const total = claims.length;

  return (
    <div className="space-y-2">
      {/* Summary row */}
      <div className="flex items-center gap-3 px-1 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-semantic-emerald" />
          <span>
            {grounded}/{total} grounded
          </span>
        </div>
        {isDelta && (
          <span className="text-brand-violet">Δ delta refinement active</span>
        )}
      </div>

      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {claims.map((claim, i) => {
            const chunkIds = claim.chunk_ids ?? (claim.chunk_id ? [claim.chunk_id] : []);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex gap-3 py-2 border-b border-border-subtle last:border-0 ${
                  claim.grounded ? "opacity-100" : "opacity-70"
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {claim.grounded ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-semantic-emerald" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-semantic-rose" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${claim.grounded ? "text-text-primary" : "text-text-secondary line-through decoration-semantic-error/50"}`}>
                    {claim.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {chunkIds.map((id) => (
                      <span
                        key={id}
                        className="text-[10px] font-mono text-muted bg-elevated px-1.5 py-0.5 rounded"
                      >
                        {id.slice(0, 12)}…
                      </span>
                    ))}
                    {claim.support_score != null && (
                      <span className="text-[10px] text-muted">
                        support {(claim.support_score * 100).toFixed(0)}%
                      </span>
                    )}
                    {claim.updated && (
                      <span className="text-[10px] text-brand-primary font-bold uppercase tracking-wider">
                        ↑ updated
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
