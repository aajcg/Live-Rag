"use client";

import { useState } from "react";
import { SessionManager } from "@/components/demo/SessionManager";
import { PipelineStepper } from "@/components/demo/PipelineStepper";
import { TranscriptInput } from "@/components/demo/TranscriptInput";
import { EvidenceDisplay } from "@/components/demo/EvidenceDisplay";
import { TelemetryPanel } from "@/components/demo/TelemetryPanel";
import { useStreaming } from "@/hooks/useStreaming";
import type { RetrievedChunk, Claim } from "@/utils/types";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

export default function DemoPage() {
  const [sessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [activeStage, setActiveStage] = useState("");
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [subqueries, setSubqueries] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<RetrievedChunk[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [decision, setDecision] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const { stream, abort } = useStreaming({
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

    // Reset state
    setAnswer("");
    setSubqueries([]);
    setEvidence([]);
    setClaims([]);
    setTelemetry(null);
    setDecision("");
    setDecisionReason("");
    setUncertainty("");
    setCompletedStages([]);
    setActiveStage("controller");
    setIsStreaming(true);

    stream(sessionId, transcript, (eventType, data) => {
      switch (eventType) {
        case "decision":
          setDecision(data.decision);
          setDecisionReason(data.reason || "");
          if (data.decision === "RETRIEVE") {
            setActiveStage("decompose");
            setCompletedStages((prev) => [...prev, "controller"]);
          } else {
            setActiveStage("");
            setCompletedStages((prev) => [...prev, "controller"]);
          }
          break;

        case "retrieval_started":
          setActiveStage("retrieve");
          setSubqueries(data.subqueries || []);
          setCompletedStages((prev) => [...prev, "decompose"]);
          break;

        case "evidence":
          setActiveStage("synthesize");
          setCompletedStages((prev) => [...prev, "retrieve", "fuse", "rerank"]);
          setEvidence(data.citations || []);
          break;

        case "claims":
          setClaims(data.claims || []);
          break;

        case "uncertainty":
          setUncertainty(data.message || "");
          break;

        case "ttft":
          setTelemetry((prev: any) => ({ ...prev, ttft_ms: data.ttft_ms }));
          break;

        case "token":
          setAnswer((prev) => prev + data.token);
          break;

        case "complete":
          setTelemetry(data.telemetry || {});
          setCompletedStages((prev) => [...prev, "synthesize"]);
          break;
      }
    });
  };

  return (
    <main className="min-h-screen pt-20">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold mb-8">Interactive Demo</h1>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left rail - Session */}
          <div className="lg:col-span-3 space-y-6">
            <SessionManager />
          </div>

          {/* Center - Chat */}
          <div className="lg:col-span-6 space-y-6">
            <PipelineStepper activeStage={activeStage} completedStages={completedStages} />
            <TranscriptInput onSend={handleSend} disabled={isStreaming} />

            {/* Response */}
            {answer && (
              <div className="p-6 rounded-xl bg-surface border border-subtle space-y-4">
                {decision && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">Decision:</span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          decision === "RETRIEVE"
                            ? "bg-brand-cyan/20 text-brand-cyan"
                            : decision === "WAIT"
                            ? "bg-semantic-amber/20 text-semantic-amber"
                            : "bg-semantic-rose/20 text-semantic-rose"
                        }`}
                      >
                        {decision}
                      </span>
                    </div>
                    {decisionReason && (
                      <span className="text-xs text-muted/70 italic ml-1">
                        Reason: {decisionReason}
                      </span>
                    )}
                  </div>
                )}

                {subqueries.length > 0 && (
                  <div>
                    <span className="text-xs text-muted mb-2 block">Subqueries:</span>
                    <div className="flex flex-wrap gap-2">
                      {subqueries.map((sq, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded-lg bg-elevated text-sm text-secondary"
                        >
                          {sq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="prose prose-invert prose-sm max-w-none">
                  <p className="text-primary leading-relaxed whitespace-pre-wrap">{answer}</p>
                </div>

                {uncertainty && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-semantic-amber/10 border border-semantic-amber/20">
                    <AlertTriangle className="w-4 h-4 text-semantic-amber mt-0.5" />
                    <span className="text-sm text-semantic-amber">{uncertainty}</span>
                  </div>
                )}

                {claims.length > 0 && (
                  <div>
                    <span className="text-xs text-muted mb-2 block">Claims:</span>
                    <div className="space-y-2">
                      {claims.map((claim, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-elevated">
                          {claim.grounded ? (
                            <CheckCircle className="w-4 h-4 text-semantic-emerald mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-semantic-rose mt-0.5" />
                          )}
                          <span className="text-sm text-secondary">{claim.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right - Telemetry & Evidence */}
          <div className="lg:col-span-3 space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">Telemetry</h3>
              <TelemetryPanel telemetry={telemetry} />
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Evidence</h3>
              <EvidenceDisplay evidence={evidence} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
