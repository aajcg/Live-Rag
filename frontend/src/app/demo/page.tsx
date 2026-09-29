"use client";

import { useState, useEffect, useRef } from "react";
import { SessionManager, TurnHistorySummary } from "@/components/demo/SessionManager";
import { PipelineStepper } from "@/components/demo/PipelineStepper";
import { TranscriptInput } from "@/components/demo/TranscriptInput";
import { EvidenceDisplay } from "@/components/demo/EvidenceDisplay";
import { TelemetryPanel } from "@/components/demo/TelemetryPanel";
import { useStreaming } from "@/hooks/useStreaming";
import type { RetrievedChunk, Claim } from "@/utils/types";
import { AlertCircle, CheckCircle, AlertTriangle, User, Bot, Sparkles, History } from "lucide-react";

export interface SessionTurn {
  id: string;
  timestamp: string;
  transcript: string;
  answer: string;
  decision: string;
  subqueries: string[];
  evidence: RetrievedChunk[];
  claims: Claim[];
  telemetry: any;
  uncertainty: string;
  isStreaming?: boolean;
}

export default function DemoPage() {
  const [mounted, setMounted] = useState(false);
  const [sessionId, setSessionId] = useState("sess_default");
  const [activeStage, setActiveStage] = useState("");
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Turn history
  const [turns, setTurns] = useState<SessionTurn[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  // Current active streaming turn state
  const [currentTurn, setCurrentTurn] = useState<SessionTurn | null>(null);

  // Initialize session ID on client only to guarantee zero hydration mismatch
  useEffect(() => {
    setMounted(true);
    const initialSession = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setSessionId(initialSession);
  }, []);

  const handleNewSession = () => {
    if (isStreaming) return;
    const newSession = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setSessionId(newSession);
    setTurns([]);
    setCurrentTurn(null);
    setSelectedTurnId(null);
    setActiveStage("");
    setCompletedStages([]);
  };

  const handleClearHistory = () => {
    if (isStreaming) return;
    setTurns([]);
    setCurrentTurn(null);
    setSelectedTurnId(null);
  };

  const { stream } = useStreaming({
    onComplete: () => {
      setIsStreaming(false);
      setActiveStage("");
    },
    onError: (error) => {
      console.error("Stream error:", error);
      setIsStreaming(false);
      setActiveStage("");
    },
  });

  const handleSend = (transcript: string) => {
    if (isStreaming) return;

    const turnId = `turn_${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const newTurn: SessionTurn = {
      id: turnId,
      timestamp: timestampStr,
      transcript,
      answer: "",
      decision: "",
      subqueries: [],
      evidence: [],
      claims: [],
      telemetry: null,
      uncertainty: "",
      isStreaming: true,
    };

    setCurrentTurn(newTurn);
    setSelectedTurnId(turnId);
    setCompletedStages([]);
    setActiveStage("controller");
    setIsStreaming(true);

    stream(sessionId, transcript, (eventType, data) => {
      switch (eventType) {
        case "decision":
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, decision: data.decision };
          });
          if (data.decision === "RETRIEVE") {
            setActiveStage("decompose");
            setCompletedStages((prev) => Array.from(new Set([...prev, "controller"])));
          } else {
            setActiveStage("");
            setCompletedStages((prev) => Array.from(new Set([...prev, "controller"])));
          }
          break;

        case "retrieval_started":
          setActiveStage("retrieve");
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, subqueries: data.subqueries || [] };
          });
          setCompletedStages((prev) => Array.from(new Set([...prev, "decompose"])));
          break;

        case "evidence":
          setActiveStage("synthesize");
          setCompletedStages((prev) => Array.from(new Set([...prev, "retrieve", "fuse", "rerank"])));
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, evidence: data.citations || [] };
          });
          break;

        case "claims":
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, claims: data.claims || [] };
          });
          break;

        case "uncertainty":
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, uncertainty: data.message || "" };
          });
          break;

        case "ttft":
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              telemetry: { ...(prev.telemetry || {}), ttft_ms: data.ttft_ms },
            };
          });
          break;

        case "token":
          setCurrentTurn((prev) => {
            if (!prev) return null;
            return { ...prev, answer: prev.answer + data.token };
          });
          break;

        case "complete":
          setCompletedStages((prev) => Array.from(new Set([...prev, "synthesize"])));
          setCurrentTurn((prev) => {
            if (!prev) return null;
            const finalized: SessionTurn = {
              ...prev,
              telemetry: data.telemetry || prev.telemetry || {},
              isStreaming: false,
            };
            // Add to completed turns history
            setTurns((existing) => [...existing, finalized]);
            return finalized;
          });
          break;
      }
    });
  };

  // Turn to display in the right sidebar (telemetry + evidence)
  const displayTurn =
    (selectedTurnId && turns.find((t) => t.id === selectedTurnId)) ||
    currentTurn ||
    (turns.length > 0 ? turns[turns.length - 1] : null);

  // Summaries for SessionManager history list
  const historySummaries: TurnHistorySummary[] = turns.map((t) => ({
    id: t.id,
    timestamp: t.timestamp,
    transcript: t.transcript,
    decision: t.decision,
    answerSummary: t.answer ? t.answer.slice(0, 60) + "..." : undefined,
    totalLatencyMs: t.telemetry?.total_latency_ms,
  }));

  if (currentTurn && currentTurn.isStreaming) {
    historySummaries.push({
      id: currentTurn.id,
      timestamp: currentTurn.timestamp,
      transcript: currentTurn.transcript,
      decision: currentTurn.decision,
      answerSummary: currentTurn.answer ? "Streaming response..." : "Processing...",
    });
  }

  return (
    <main className="min-h-screen pt-20 pb-16">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-indigo" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Interactive Live RAG</h1>
            </div>
            <p className="text-xs md:text-sm text-secondary mt-1">
              Real-time conversational retrieval engine with STT voice input, multi-intent decomposition, and delta refinement.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-semantic-emerald/10 text-semantic-emerald font-medium border border-semantic-emerald/20 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-semantic-emerald animate-pulse"></span>
              Live Pipeline Ready
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Rail - Session & History */}
          <div className="lg:col-span-3 space-y-6">
            <SessionManager
              sessionId={sessionId}
              onNewSession={handleNewSession}
              history={historySummaries}
              selectedTurnId={selectedTurnId}
              onSelectTurn={(id) => setSelectedTurnId(id)}
              onClearHistory={handleClearHistory}
            />
          </div>

          {/* Center Column - Pipeline Stepper, Inputs & Conversation Timeline */}
          <div className="lg:col-span-6 space-y-6">
            <PipelineStepper activeStage={activeStage} completedStages={completedStages} />

            {/* Voice & Text Input */}
            <TranscriptInput onSend={handleSend} disabled={isStreaming} />

            {/* Conversation / Turn History Feed */}
            <div className="space-y-6 pt-2">
              {turns.length === 0 && !currentTurn && (
                <div className="p-8 rounded-xl bg-surface/50 border border-dashed border-subtle text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-brand-indigo/10 text-brand-indigo flex items-center justify-center mx-auto">
                    <Bot className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-base text-primary">Conversation History is Empty</h3>
                  <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
                    Type a query or press the microphone button to dictate questions about the Aventro Motors corpus.
                  </p>
                </div>
              )}

              {/* Render Historical Completed Turns */}
              {turns.map((turn, index) => {
                // If this turn is currently being updated in streaming, don't duplicate
                if (currentTurn && currentTurn.id === turn.id) return null;
                const isSelected = selectedTurnId === turn.id;

                return (
                  <div
                    key={turn.id}
                    onClick={() => setSelectedTurnId(turn.id)}
                    className={`rounded-xl border transition-all p-5 space-y-4 cursor-pointer ${
                      isSelected
                        ? "bg-surface border-brand-indigo/50 shadow-md ring-1 ring-brand-indigo/30"
                        : "bg-surface/70 border-subtle hover:border-default"
                    }`}
                  >
                    {/* User Question */}
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-brand-indigo/10 text-brand-indigo flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-primary">User</span>
                          <span className="text-[10px] font-mono text-muted">{turn.timestamp}</span>
                        </div>
                        <p className="text-sm text-primary font-medium">{turn.transcript}</p>
                      </div>
                    </div>

                    {/* Assistant Response */}
                    <div className="flex items-start gap-3 pt-3 border-t border-subtle">
                      <div className="w-7 h-7 rounded-lg bg-semantic-emerald/10 text-semantic-emerald flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-primary">Live RAG Engine</span>
                          {turn.decision && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
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

                        {/* Subqueries */}
                        {turn.subqueries && turn.subqueries.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted block">Decomposed Subqueries:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {turn.subqueries.map((sq, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-md bg-elevated text-xs text-secondary border border-subtle"
                                >
                                  {sq}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Answer Text */}
                        <div className="prose prose-invert prose-sm max-w-none">
                          <p className="text-primary text-sm leading-relaxed whitespace-pre-wrap">
                            {turn.answer || "No response generated."}
                          </p>
                        </div>

                        {/* Uncertainty Notice */}
                        {turn.uncertainty && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-semantic-amber/10 border border-semantic-amber/20">
                            <AlertTriangle className="w-4 h-4 text-semantic-amber flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-semantic-amber">{turn.uncertainty}</span>
                          </div>
                        )}

                        {/* Grounded Claims */}
                        {turn.claims && turn.claims.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] text-muted block font-medium uppercase tracking-wider">
                              Grounded Claims ({turn.claims.length})
                            </span>
                            <div className="space-y-1">
                              {turn.claims.map((claim, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 p-2 rounded-lg bg-elevated text-xs text-secondary border border-subtle/50"
                                >
                                  {claim.grounded ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 text-semantic-rose flex-shrink-0 mt-0.5" />
                                  )}
                                  <span>{claim.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer turn metadata */}
                        <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                          <span>
                            {turn.evidence.length} evidence citation{turn.evidence.length !== 1 ? "s" : ""}
                          </span>
                          {turn.telemetry?.total_latency_ms && (
                            <span className="font-mono">
                              Total latency: {(turn.telemetry.total_latency_ms / 1000).toFixed(2)}s
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Active Streaming Turn */}
              {currentTurn && currentTurn.isStreaming && (
                <div className="rounded-xl border border-brand-indigo bg-surface p-5 space-y-4 shadow-lg ring-1 ring-brand-indigo/30 animate-pulse">
                  {/* User Question */}
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-brand-indigo/10 text-brand-indigo flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-primary">User</span>
                        <span className="text-[10px] font-mono text-muted">{currentTurn.timestamp}</span>
                      </div>
                      <p className="text-sm text-primary font-medium">{currentTurn.transcript}</p>
                    </div>
                  </div>

                  {/* Streaming Assistant Response */}
                  <div className="flex items-start gap-3 pt-3 border-t border-subtle">
                    <div className="w-7 h-7 rounded-lg bg-brand-cyan/10 text-brand-cyan flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 animate-spin" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                          <span>Streaming RAG...</span>
                        </span>
                        {currentTurn.decision && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              currentTurn.decision === "RETRIEVE"
                                ? "bg-brand-cyan/20 text-brand-cyan"
                                : "bg-semantic-amber/20 text-semantic-amber"
                            }`}
                          >
                            {currentTurn.decision}
                          </span>
                        )}
                      </div>

                      {/* Subqueries */}
                      {currentTurn.subqueries && currentTurn.subqueries.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted block">Decomposed Subqueries:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {currentTurn.subqueries.map((sq, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-elevated text-xs text-secondary border border-subtle"
                              >
                                {sq}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Streamed Answer */}
                      <div className="prose prose-invert prose-sm max-w-none">
                        <p className="text-primary text-sm leading-relaxed whitespace-pre-wrap">
                          {currentTurn.answer}
                          <span className="inline-block w-1.5 h-4 ml-1 bg-brand-cyan animate-pulse align-middle" />
                        </p>
                      </div>

                      {/* Claims preview */}
                      {currentTurn.claims && currentTurn.claims.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] text-muted block font-medium">Claims</span>
                          <div className="space-y-1">
                            {currentTurn.claims.map((claim, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 p-1.5 rounded-lg bg-elevated text-xs text-secondary"
                              >
                                <CheckCircle className="w-3.5 h-3.5 text-semantic-emerald flex-shrink-0 mt-0.5" />
                                <span>{claim.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Rail - Telemetry & Evidence Inspector */}
          <div className="lg:col-span-3 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Telemetry Metrics
                </h3>
                {displayTurn && (
                  <span className="text-[10px] font-mono text-muted">
                    {displayTurn.id}
                  </span>
                )}
              </div>
              <TelemetryPanel telemetry={displayTurn?.telemetry} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Retrieved Evidence ({displayTurn?.evidence?.length || 0})
                </h3>
              </div>
              <EvidenceDisplay evidence={displayTurn?.evidence || []} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
