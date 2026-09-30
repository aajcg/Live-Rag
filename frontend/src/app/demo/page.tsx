"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, BookOpen, AlertTriangle } from "lucide-react";
import { useRAGStream } from "@/hooks/useRAGStream";
import { generateSessionId } from "@/utils/utils";

import { PipelineStepper } from "@/components/demo/PipelineStepper";
import { TranscriptInput } from "@/components/demo/TranscriptInput";
import { EvidenceDisplay } from "@/components/demo/EvidenceDisplay";
import { TelemetryPanel } from "@/components/demo/TelemetryPanel";
import { EventLog } from "@/components/demo/EventLog";
import { ClaimsPanel } from "@/components/demo/ClaimsPanel";
import { SessionManager } from "@/components/demo/SessionManager";

// ─── Answer block (cleaner) ──────────────────────────────────────────────────
function AnswerBlock({
  answer,
  isStreaming,
  subqueries,
  citations,
  uncertainty,
  uncertaintyFlag,
  answerVersion,
}: {
  answer: string;
  isStreaming: boolean;
  subqueries: string[];
  citations: any[];
  uncertainty?: string;
  uncertaintyFlag?: boolean;
  answerVersion?: number;
}) {
  if (!answer && !isStreaming) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6"
    >
      <div className="flex gap-4">
        {/* Avatar line */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="w-8 h-8 bg-brand-primary rounded-full flex items-center justify-center shadow-soft">
            <div className="w-3 h-3 bg-white rounded-full" />
          </div>
          <div className="w-px h-full bg-border-subtle mt-2" />
        </div>

        {/* Content */}
        <div className="flex-1 pb-8">
          {subqueries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {subqueries.map((sq, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-black/5 text-text-secondary"
                >
                  Q: {sq}
                </span>
              ))}
              {answerVersion && answerVersion > 1 && (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-brand-soft/10 text-brand-soft">
                  v{answerVersion}
                </span>
              )}
            </div>
          )}

          {uncertaintyFlag && uncertainty && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-2 p-3 mb-4 rounded bg-semantic-error/10 border border-semantic-error/20"
            >
              <AlertTriangle className="w-4 h-4 text-semantic-error mt-0.5 flex-shrink-0" />
              <p className="text-xs text-semantic-error leading-relaxed">
                {uncertainty}
              </p>
            </motion.div>
          )}

          <div className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">
            {answer}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-brand-primary/50 animate-pulse ml-1 align-middle" />
            )}
          </div>

          {citations.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <BookOpen className="w-4 h-4 text-text-muted mt-0.5" />
              {citations.map((c: any, i: number) => (
                <span
                  key={i}
                  className="text-xs text-brand-primary hover:underline cursor-pointer"
                >
                  [{c.label ?? c.chunk_id?.slice(0, 4)}]
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function DemoPage() {
  const [sessionId, setSessionId] = useState("initializing");

  useEffect(() => {
    setSessionId(generateSessionId());
  }, []);
  const { state, stream, abort, reset } = useRAGStream();

  const handleSend = (transcript: string) => stream(sessionId, transcript);
  const handleAbort = () => abort();
  const handleNewSession = (id: string) => { setSessionId(id); reset(); };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-[1200px] mx-auto px-6">
        
        {/* Error */}
        <AnimatePresence>
          {state.error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 p-4 rounded bg-semantic-error/10 text-semantic-error text-sm flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              {state.error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 mb-8">
          
          {/* LEFT: Main Chat / Pipeline Area */}
          <div className="space-y-8">
            <SessionManager
              sessionId={sessionId}
              onNewSession={handleNewSession}
              answerVersion={state.answerVersion}
              isStreaming={state.isStreaming}
            />

            <div className="bg-surface p-6 rounded-2xl shadow-soft border border-border-subtle">
              <PipelineStepper
                activeStage={state.activeStage}
                completedStages={state.completedStages}
                isStreaming={state.isStreaming}
                decision={state.decision}
                decisionReason={state.reason}
                isProvisional={state.isProvisional}
                isDelta={state.isDelta}
              />
              <TranscriptInput
                onSend={handleSend}
                disabled={state.isStreaming}
                onAbort={handleAbort}
              />
            </div>

            <AnswerBlock
              answer={state.answer}
              isStreaming={state.isStreaming}
              subqueries={state.subqueries}
              citations={state.citations}
              uncertainty={state.uncertainty}
              uncertaintyFlag={state.uncertaintyFlag}
              answerVersion={state.answerVersion}
            />
          </div>

          {/* RIGHT: Telemetry & Evidence (Clean text style, no heavy boxes) */}
          <div className="space-y-10">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4 border-b border-border-subtle pb-2">
                Performance Telemetry
              </h3>
              <TelemetryPanel
                telemetry={state.telemetry}
                retrievalEvents={state.retrievalEvents}
                answerVersion={state.answerVersion}
                preservedClaimCount={state.preservedClaimCount}
                updatedClaimCount={state.updatedClaimCount}
              />
            </div>

            {state.claims.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4 border-b border-border-subtle pb-2 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" /> Grounding Analysis
                </h3>
                <ClaimsPanel claims={state.claims} isDelta={state.isDelta} />
              </div>
            )}

            {state.evidence.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4 border-b border-border-subtle pb-2">
                  Retrieved Evidence
                </h3>
                <EvidenceDisplay evidence={state.evidence} />
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: Terminal */}
        <div className="mt-12">
          <EventLog events={state.events} />
        </div>

      </div>
    </div>
  );
}
