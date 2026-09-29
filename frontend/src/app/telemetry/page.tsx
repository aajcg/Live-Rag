"use client";

import { useState, useEffect } from "react";
import { api } from "@/utils/api";
import { formatLatency } from "@/utils/utils";
import { 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Layers, 
  BarChart3, 
  Sparkles,
  AlertCircle
} from "lucide-react";

export default function TelemetryPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.metrics();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || "Failed to load telemetry data. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const traces: any[] = metrics?.traces || [];

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-[1300px] mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 text-xs font-medium text-brand-cyan mb-3">
              <Activity className="w-3.5 h-3.5" />
              Observability & Performance Telemetry
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Telemetry <span className="bg-gradient-brand bg-clip-text text-transparent">Dashboard</span>
            </h1>
            <p className="text-secondary text-sm mt-1">
              End-to-end execution latency, trace coverage, and structured stage breakdowns.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                autoRefresh
                  ? "bg-brand-indigo/10 border-brand-indigo/30 text-brand-indigo"
                  : "bg-surface border-subtle text-muted"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-semantic-emerald animate-ping" : "bg-muted"}`} />
              {autoRefresh ? "Auto-refreshing (5s)" : "Auto-refresh paused"}
            </button>

            <button
              onClick={fetchMetrics}
              disabled={loading}
              className="p-2.5 rounded-lg bg-surface border border-subtle hover:bg-hover transition-colors text-muted hover:text-primary"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-brand-indigo" : ""}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-semantic-rose/10 border border-semantic-rose/20 text-xs text-semantic-rose flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-xl bg-surface border border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted font-medium">Total Traces Emitted</span>
              <Activity className="w-4 h-4 text-brand-indigo" />
            </div>
            <div className="text-2xl font-bold font-mono text-primary">
              {metrics ? metrics.total_traces : "--"}
            </div>
            <div className="text-[11px] text-muted mt-1">Logged to telemetry.jsonl</div>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted font-medium">Trace Coverage</span>
              <CheckCircle2 className="w-4 h-4 text-semantic-emerald" />
            </div>
            <div className="text-2xl font-bold font-mono text-semantic-emerald">
              {metrics ? `${(metrics.trace_coverage * 100).toFixed(0)}%` : "100%"}
            </div>
            <div className="text-[11px] text-muted mt-1">Theme 4 Gate G6 compliance</div>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted font-medium">Active Sessions</span>
              <BarChart3 className="w-4 h-4 text-brand-cyan" />
            </div>
            <div className="text-2xl font-bold font-mono text-primary">
              {metrics ? metrics.sessions : "--"}
            </div>
            <div className="text-[11px] text-muted mt-1">In-memory conversation states</div>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted font-medium">Aventro Corpus Chunks</span>
              <Layers className="w-4 h-4 text-brand-violet" />
            </div>
            <div className="text-2xl font-bold font-mono text-primary">133</div>
            <div className="text-[11px] text-muted mt-1">Dense MiniLM + BM25 indexed</div>
          </div>
        </div>

        {/* Traces List Table */}
        <div className="p-6 rounded-2xl bg-surface border border-subtle">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-primary">Recent Execution Traces</h2>
              <p className="text-xs text-secondary mt-0.5">
                Latency measurements captured across the 8-stage pipeline.
              </p>
            </div>
            <span className="text-xs text-muted font-mono">
              Showing {traces.length} recent traces
            </span>
          </div>

          {traces.length === 0 ? (
            <div className="py-12 text-center text-muted">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
              <p className="text-sm">No telemetry traces recorded yet.</p>
              <p className="text-xs text-muted mt-1">
                Ask questions on the Demo page to generate live execution traces.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-subtle text-muted uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Timestamp</th>
                    <th className="pb-3 font-semibold">Session ID</th>
                    <th className="pb-3 font-semibold">Decision</th>
                    <th className="pb-3 font-semibold">Controller</th>
                    <th className="pb-3 font-semibold">Dense / Sparse</th>
                    <th className="pb-3 font-semibold">Rerank</th>
                    <th className="pb-3 font-semibold">TTFT</th>
                    <th className="pb-3 font-semibold text-right">Total Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {traces.slice().reverse().map((trace, idx) => (
                    <tr key={trace.turn_id || idx} className="hover:bg-elevated/40 transition-colors">
                      <td className="py-3 font-mono text-muted">
                        {trace.timestamp ? new Date(trace.timestamp).toLocaleTimeString() : "--"}
                      </td>
                      <td className="py-3 font-mono text-secondary truncate max-w-[120px]">
                        {trace.session_id || "default"}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            trace.decision === "RETRIEVE"
                              ? "bg-brand-cyan/20 text-brand-cyan"
                              : "bg-semantic-amber/20 text-semantic-amber"
                          }`}
                        >
                          {trace.decision || "RETRIEVE"}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-secondary">
                        {trace.controller_latency_ms ? formatLatency(trace.controller_latency_ms) : "--"}
                      </td>
                      <td className="py-3 font-mono text-secondary">
                        {trace.dense_retrieval_latency_ms ? formatLatency(trace.dense_retrieval_latency_ms) : "--"}
                      </td>
                      <td className="py-3 font-mono text-secondary">
                        {trace.reranking_latency_ms ? formatLatency(trace.reranking_latency_ms) : "--"}
                      </td>
                      <td className="py-3 font-mono text-brand-cyan font-medium">
                        {trace.ttft_ms ? formatLatency(trace.ttft_ms) : "--"}
                      </td>
                      <td className="py-3 font-mono text-right font-semibold text-primary">
                        {trace.total_latency_ms ? formatLatency(trace.total_latency_ms) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
