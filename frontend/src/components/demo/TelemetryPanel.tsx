"use client";

import { motion, AnimatePresence } from "framer-motion";
import { formatLatency } from "@/utils/utils";

interface TelemetryPanelProps {
  telemetry?: Record<string, any> | null;
  retrievalEvents?: any[];
  answerVersion?: number;
  preservedClaimCount?: number;
  updatedClaimCount?: number;
}

const STAGE_METRICS = [
  {
    key: "controller_latency_ms",
    label: "Controller",
    color: "#F59E0B",
    bg: "bg-semantic-amber",
  },
  {
    key: "decomposition_latency_ms",
    label: "Decompose",
    color: "#8B5CF6",
    bg: "bg-brand-violet",
  },
  {
    key: "dense_retrieval_latency_ms",
    label: "Dense",
    color: "#6366F1",
    bg: "bg-brand-indigo",
  },
  {
    key: "sparse_retrieval_latency_ms",
    label: "Sparse (BM25)",
    color: "#818CF8",
    bg: "bg-brand-indigo",
  },
  {
    key: "fusion_latency_ms",
    label: "RRF Fusion",
    color: "#22D3EE",
    bg: "bg-brand-cyan",
  },
  {
    key: "reranking_latency_ms",
    label: "Rerank",
    color: "#10B981",
    bg: "bg-semantic-emerald",
  },
  {
    key: "synthesis_latency_ms",
    label: "Synthesis",
    color: "#6366F1",
    bg: "bg-brand-indigo",
  },
];

function LatencyBar({
  label,
  value,
  max,
  color,
  bg,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  bg: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xs font-mono text-secondary">
          {formatLatency(value)}
        </span>
      </div>
      <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${bg}`}
        />
      </div>
    </div>
  );
}

export function TelemetryPanel({
  telemetry,
  retrievalEvents,
  answerVersion,
  preservedClaimCount,
  updatedClaimCount,
}: TelemetryPanelProps) {
  if (!telemetry) {
    return (
      <div className="rounded-2xl bg-surface border border-subtle p-4 text-center text-muted text-sm h-40 flex items-center justify-center">
        <div className="space-y-1">
          <div className="w-6 h-6 rounded-full border-2 border-muted/30 border-t-muted animate-spin mx-auto" />
          <p>Awaiting telemetry...</p>
        </div>
      </div>
    );
  }

  const validMetrics = STAGE_METRICS.filter(
    (m) => telemetry[m.key] != null && telemetry[m.key] > 0
  );
  const maxLatency = Math.max(
    ...validMetrics.map((m) => telemetry[m.key] as number),
    1
  );

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-white/50 rounded-lg shadow-sm"
        >
          <div className="text-xs text-muted mb-1">TTFT</div>
          <div className="font-mono text-lg font-semibold text-brand-cyan">
            {telemetry.ttft_ms != null ? formatLatency(telemetry.ttft_ms) : "—"}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-3 bg-white/50 rounded-lg shadow-sm"
        >
          <div className="text-xs text-muted mb-1">Total</div>
          <div className="font-mono text-lg font-semibold text-primary">
            {telemetry.total_latency_ms != null
              ? formatLatency(telemetry.total_latency_ms)
              : "—"}
          </div>
        </motion.div>
        {answerVersion != null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-3 bg-white/50 rounded-lg shadow-sm"
          >
            <div className="text-xs text-muted mb-1">Answer v</div>
            <div className="font-mono text-lg font-semibold text-brand-violet">
              v{answerVersion}
            </div>
          </motion.div>
        )}
        {telemetry.citation_count != null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-3 bg-white/50 rounded-lg shadow-sm"
          >
            <div className="text-xs text-muted mb-1">Citations</div>
            <div className="font-mono text-lg font-semibold text-semantic-emerald">
              {telemetry.citation_count}
            </div>
          </motion.div>
        )}
      </div>

      {/* Delta info */}
      <AnimatePresence>
        {(preservedClaimCount != null && preservedClaimCount > 0) ||
        (updatedClaimCount != null && updatedClaimCount > 0) ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="p-3 rounded-lg bg-brand-soft/10 text-brand-primary text-xs"
          >
            <div className="font-bold uppercase tracking-wider mb-2">
              Δ Delta Engine
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-muted">
                Preserved:{" "}
                <span className="text-semantic-emerald font-mono">
                  {preservedClaimCount}
                </span>
              </span>
              <span className="text-muted">
                Updated:{" "}
                <span className="text-brand-cyan font-mono">
                  {updatedClaimCount}
                </span>
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Latency waterfall */}
      {validMetrics.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="text-xs font-medium text-muted mb-3">
            Stage Latency Waterfall
          </div>
          {validMetrics.map((m) => (
            <LatencyBar
              key={m.key}
              label={m.label}
              value={telemetry[m.key] as number}
              max={maxLatency}
              color={m.color}
              bg={m.bg}
            />
          ))}
        </div>
      )}

      {/* Retrieval events */}
      {retrievalEvents && retrievalEvents.length > 0 && (
        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">
            Retrieval Events
          </div>
          <div className="space-y-2">
            {retrievalEvents.map((evt, i) => (
              <div
                key={i}
                className="text-xs space-y-1 pb-2 border-b border-subtle last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-mono truncate max-w-[160px]">
                    {evt.query}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-brand-indigo/15 text-brand-indigo font-mono text-[10px]">
                    {evt.trigger}
                  </span>
                </div>
                <div className="flex gap-3 text-muted font-mono text-[10px]">
                  <span>
                    dense{" "}
                    <span className="text-brand-indigo">
                      {(evt.dense_ms ?? 0).toFixed(0)}ms
                    </span>
                  </span>
                  <span>
                    sparse{" "}
                    <span className="text-brand-violet">
                      {(evt.sparse_ms ?? 0).toFixed(0)}ms
                    </span>
                  </span>
                  <span>
                    rerank{" "}
                    <span className="text-semantic-emerald">
                      {(evt.rerank_ms ?? 0).toFixed(0)}ms
                    </span>
                  </span>
                  <span>
                    results{" "}
                    <span className="text-secondary">{evt.results ?? 0}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extra fields */}
      {telemetry.number_of_subqueries != null && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            ["Sub-queries", telemetry.number_of_subqueries],
            ["Retrieved", telemetry.number_of_retrieved_chunks ?? "—"],
            ["Final ev.", telemetry.number_of_final_evidence_chunks ?? "—"],
          ].map(([label, value]) => (
            <div key={label as string} className="p-2 rounded-lg bg-elevated text-center">
              <div className="text-muted">{label}</div>
              <div className="font-mono font-semibold text-secondary mt-0.5">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
