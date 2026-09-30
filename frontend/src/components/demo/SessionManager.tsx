"use client";

import { useState, useEffect } from "react";
import {
  Copy,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Database,
} from "lucide-react";
import { api } from "@/utils/api";
import { generateSessionId, copyToClipboard } from "@/utils/utils";

interface SessionManagerProps {
  sessionId: string;
  onNewSession: (id: string) => void;
  answerVersion?: number;
  isStreaming?: boolean;
}

type Status = "checking" | "ok" | "error";

export function SessionManager({
  sessionId,
  onNewSession,
  answerVersion,
  isStreaming,
}: SessionManagerProps) {
  const [healthStatus, setHealthStatus] = useState<Status>("checking");
  const [corpusStatus, setCorpusStatus] = useState<Status>("checking");
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [corpusName, setCorpusName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkHealth();
    checkReady();
  }, []);

  const checkHealth = async () => {
    try {
      await api.health();
      setHealthStatus("ok");
    } catch {
      setHealthStatus("error");
    }
  };

  const checkReady = async () => {
    try {
      const data = await api.ready();
      setCorpusStatus(data.ready ? "ok" : "error");
      setChunkCount(data.indexed_chunks ?? null);
      setCorpusName(data.corpus ?? "");
    } catch {
      setCorpusStatus("error");
    }
  };

  const handleCopy = async () => {
    await copyToClipboard(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const StatusDot = ({ status }: { status: Status }) =>
    status === "checking" ? (
      <Loader2 className="w-3.5 h-3.5 text-muted animate-spin" />
    ) : status === "ok" ? (
      <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald" />
    ) : (
      <XCircle className="w-3.5 h-3.5 text-semantic-rose" />
    );

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
          Session Identity
        </span>
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-semantic-emerald animate-pulse" />
            <span className="text-[10px] text-semantic-emerald font-medium">
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Session ID */}
      <div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-text-primary truncate">
            {sessionId}
          </code>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            title="Copy session ID"
          >
            {copied ? (
              <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-text-muted" />
            )}
          </button>
          <button
            onClick={() => onNewSession(generateSessionId())}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            title="New session"
          >
            <RefreshCw className="w-3.5 h-3.5 text-text-muted" />
          </button>
        </div>
      </div>

      {/* Status grid */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-1.5">
          <StatusDot status={healthStatus} />
          <span className="text-[10px] uppercase font-bold text-text-muted">
            {healthStatus === "ok" ? "API ONLINE" : healthStatus === "error" ? "API OFFLINE" : "..."}
          </span>
        </div>
        <div className="w-px h-3 bg-border-subtle" />
        <div className="flex items-center gap-1.5">
          <StatusDot status={corpusStatus} />
          <span className="text-[10px] uppercase font-bold text-text-muted">
            {corpusStatus === "ok" ? "CORPUS READY" : corpusStatus === "error" ? "CORPUS UNREADY" : "..."}
          </span>
        </div>
      </div>

      {/* Corpus info */}
      {corpusStatus === "ok" && chunkCount != null && (
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-text-muted">
          <Database className="w-3.5 h-3.5 text-brand-primary" />
          <div>
            <span className="text-brand-primary">
              {chunkCount.toLocaleString()}
            </span>{" "}
            CHUNKS INDEXED
          </div>
        </div>
      )}

      {/* Answer version */}
      {answerVersion != null && answerVersion > 1 && (
        <div className="text-[10px] font-bold text-brand-soft uppercase tracking-widest">
          Answer version: v{answerVersion}
        </div>
      )}
    </div>
  );
}
