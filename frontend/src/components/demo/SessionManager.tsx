"use client";

import { useState, useEffect } from "react";
import { Copy, RefreshCw, CheckCircle, XCircle, Clock, MessageSquare, ChevronRight, Trash2 } from "lucide-react";
import { api } from "@/utils/api";
import { copyToClipboard } from "@/utils/utils";

export interface TurnHistorySummary {
  id: string;
  timestamp: string;
  transcript: string;
  decision?: string;
  answerSummary?: string;
  totalLatencyMs?: number;
}

interface SessionManagerProps {
  sessionId: string;
  onNewSession: () => void;
  history: TurnHistorySummary[];
  selectedTurnId: string | null;
  onSelectTurn: (id: string) => void;
  onClearHistory?: () => void;
}

export function SessionManager({
  sessionId,
  onNewSession,
  history,
  selectedTurnId,
  onSelectTurn,
  onClearHistory,
}: SessionManagerProps) {
  const [healthStatus, setHealthStatus] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [readyStatus, setReadyStatus] = useState<"checking" | "ready" | "not-ready">("checking");
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    checkHealth();
    checkReady();
  }, []);

  const checkHealth = async () => {
    try {
      await api.health();
      setHealthStatus("healthy");
    } catch {
      setHealthStatus("unhealthy");
    }
  };

  const checkReady = async () => {
    try {
      const data = await api.ready();
      setReadyStatus(data.ready ? "ready" : "not-ready");
      setChunkCount(data.chunk_count || 133);
    } catch {
      setReadyStatus("not-ready");
    }
  };

  const handleCopy = async () => {
    if (!sessionId) return;
    await copyToClipboard(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Session Identity & Backend Status Card */}
      <div className="p-4 rounded-xl bg-surface border border-subtle space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted">Session Identity</label>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-indigo/10 text-brand-indigo font-semibold">
              Live RAG
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code 
              suppressHydrationWarning
              className="flex-1 px-3 py-2 rounded-lg bg-elevated text-xs font-mono text-secondary truncate"
            >
              {mounted ? sessionId : "sess_initializing..."}
            </code>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg bg-elevated hover:bg-hover transition-colors text-muted hover:text-primary"
              aria-label="Copy session ID"
              title="Copy session ID"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-semantic-emerald" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onNewSession}
              className="p-2 rounded-lg bg-elevated hover:bg-hover transition-colors text-muted hover:text-primary"
              aria-label="New session"
              title="Start fresh session"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Server & Corpus Status */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-subtle">
          <div>
            <label className="text-[11px] text-muted mb-1 block">API Backend</label>
            <div className="flex items-center gap-1.5">
              {healthStatus === "checking" ? (
                <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
              ) : healthStatus === "healthy" ? (
                <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-semantic-rose" />
              )}
              <span className="text-xs text-secondary capitalize font-medium">{healthStatus}</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted mb-1 block">Aventro Index</label>
            <div className="flex items-center gap-1.5">
              {readyStatus === "checking" ? (
                <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
              ) : readyStatus === "ready" ? (
                <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-semantic-rose" />
              )}
              <span className="text-xs text-secondary capitalize font-medium">
                {readyStatus === "ready" ? `${chunkCount} chunks` : "Indexing"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Session Inputs & Turns History */}
      <div className="p-4 rounded-xl bg-surface border border-subtle">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-indigo" />
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">
              Session History ({history.length})
            </h3>
          </div>
          {history.length > 0 && onClearHistory && (
            <button
              onClick={onClearHistory}
              className="text-[11px] text-muted hover:text-semantic-rose flex items-center gap-1 transition-colors"
              title="Clear session history"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-6 px-3 text-center rounded-lg bg-base/50 border border-dashed border-subtle">
            <MessageSquare className="w-5 h-5 text-muted mx-auto mb-1.5 opacity-50" />
            <p className="text-xs text-muted">No questions asked yet in this session.</p>
            <p className="text-[10px] text-muted/70 mt-1">
              Ask a question via text or microphone to start history.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {history.map((turn, index) => {
              const isSelected = selectedTurnId === turn.id;
              return (
                <button
                  key={turn.id}
                  onClick={() => onSelectTurn(turn.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? "bg-brand-indigo/10 border-brand-indigo/40 shadow-sm"
                      : "bg-elevated hover:bg-hover border-subtle"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono text-muted">
                      Turn #{index + 1} • {turn.timestamp}
                    </span>
                    {turn.decision && (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                          turn.decision === "RETRIEVE"
                            ? "bg-brand-cyan/20 text-brand-cyan"
                            : turn.decision === "WAIT"
                            ? "bg-semantic-amber/20 text-semantic-amber"
                            : "bg-semantic-rose/20 text-semantic-rose"
                        }`}
                      >
                        {turn.decision}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary font-medium line-clamp-2 leading-snug">
                    "{turn.transcript}"
                  </p>
                  {turn.answerSummary && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                      <span className="line-clamp-1">{turn.answerSummary}</span>
                      <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-60" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
