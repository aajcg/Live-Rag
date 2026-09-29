"use client";

import { useState, useEffect } from "react";
import { Copy, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/utils/api";
import { generateSessionId, copyToClipboard, formatLatency } from "@/utils/utils";

export function SessionManager() {
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [healthStatus, setHealthStatus] = useState<"checking" | "healthy" | "unhealthy">("checking");
  const [readyStatus, setReadyStatus] = useState<"checking" | "ready" | "not-ready">("checking");
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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
      setChunkCount(data.chunk_count);
    } catch {
      setReadyStatus("not-ready");
    }
  };

  const handleCopy = async () => {
    await copyToClipboard(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewSession = () => {
    setSessionId(generateSessionId());
  };

  return (
    <div className="p-4 rounded-xl bg-surface border border-subtle space-y-4">
      <div>
        <label className="text-xs text-muted mb-2 block">Session ID</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-elevated text-sm font-mono text-secondary">
            {sessionId}
          </code>
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg bg-elevated hover:bg-hover transition-colors"
            aria-label="Copy session ID"
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 text-semantic-emerald" />
            ) : (
              <Copy className="w-4 h-4 text-muted" />
            )}
          </button>
          <button
            onClick={handleNewSession}
            className="p-2 rounded-lg bg-elevated hover:bg-hover transition-colors"
            aria-label="New session"
          >
            <RefreshCw className="w-4 h-4 text-muted" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted mb-1 block">API Health</label>
          <div className="flex items-center gap-2">
            {healthStatus === "checking" ? (
              <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
            ) : healthStatus === "healthy" ? (
              <CheckCircle className="w-4 h-4 text-semantic-emerald" />
            ) : (
              <XCircle className="w-4 h-4 text-semantic-rose" />
            )}
            <span className="text-sm text-secondary capitalize">{healthStatus}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Corpus Ready</label>
          <div className="flex items-center gap-2">
            {readyStatus === "checking" ? (
              <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
            ) : readyStatus === "ready" ? (
              <CheckCircle className="w-4 h-4 text-semantic-emerald" />
            ) : (
              <XCircle className="w-4 h-4 text-semantic-rose" />
            )}
            <span className="text-sm text-secondary capitalize">{readyStatus}</span>
          </div>
        </div>
      </div>

      {readyStatus === "ready" && (
        <div className="text-xs text-muted">
          Indexed chunks: <span className="font-mono text-secondary">{chunkCount}</span>
        </div>
      )}
    </div>
  );
}
