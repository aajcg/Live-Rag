"use client";

import { formatLatency } from "@/utils/utils";

interface TelemetryPanelProps {
  telemetry?: {
    controller_latency_ms?: number;
    dense_retrieval_latency_ms?: number;
    sparse_retrieval_latency_ms?: number;
    fusion_latency_ms?: number;
    reranking_latency_ms?: number;
    synthesis_latency_ms?: number;
    ttft_ms?: number;
    total_latency_ms?: number;
  };
}

const metrics = [
  { key: "controller_latency_ms", label: "Controller", color: "bg-semantic-amber" },
  { key: "dense_retrieval_latency_ms", label: "Dense", color: "bg-brand-indigo" },
  { key: "sparse_retrieval_latency_ms", label: "Sparse", color: "bg-brand-violet" },
  { key: "fusion_latency_ms", label: "Fusion", color: "bg-brand-cyan" },
  { key: "reranking_latency_ms", label: "Rerank", color: "bg-semantic-emerald" },
  { key: "synthesis_latency_ms", label: "Synthesis", color: "bg-brand-indigo" },
];

export function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  if (!telemetry) {
    return (
      <div className="p-4 rounded-xl bg-surface border border-subtle text-center text-muted text-sm">
        No telemetry data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => {
          const value = telemetry[metric.key as keyof typeof telemetry] as number;
          if (!value) return null;
          return (
            <div key={metric.key} className="p-3 rounded-lg bg-elevated">
              <div className="text-xs text-muted mb-1">{metric.label}</div>
              <div className="font-mono text-sm text-primary">{formatLatency(value)}</div>
            </div>
          );
        })}
      </div>

      {telemetry.ttft_ms && (
        <div className="p-3 rounded-lg bg-elevated border border-subtle">
          <div className="text-xs text-muted mb-1">TTFT</div>
          <div className="font-mono text-sm text-brand-cyan">{formatLatency(telemetry.ttft_ms)}</div>
        </div>
      )}

      {telemetry.total_latency_ms && (
        <div className="p-3 rounded-lg bg-elevated border border-subtle">
          <div className="text-xs text-muted mb-1">Total Latency</div>
          <div className="font-mono text-lg text-primary">{formatLatency(telemetry.total_latency_ms)}</div>
        </div>
      )}
    </div>
  );
}
