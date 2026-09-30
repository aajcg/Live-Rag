"use client";

import { useState, useCallback, useRef } from "react";
import { api } from "@/utils/api";

export type PipelineEventLog = {
  id: string;
  timestamp: number;
  event: string;
  data: any;
};

export type StreamState = {
  isStreaming: boolean;
  events: PipelineEventLog[];
  decision: string;
  reason: string;
  intentStability: number;
  retrievalMode: string;
  isProvisional: boolean;
  isDelta: boolean;
  trigger: string;
  subqueries: string[];
  evidence: any[];
  claims: any[];
  citations: any[];
  retrievalEvents: any[];
  answer: string;
  uncertainty: string;
  uncertaintyFlag: boolean;
  answerVersion: number;
  preservedClaimCount: number;
  updatedClaimCount: number;
  telemetry: any;
  activeStage: string;
  completedStages: string[];
  error: string | null;
};

const INITIAL_STATE: StreamState = {
  isStreaming: false,
  events: [],
  decision: "",
  reason: "",
  intentStability: 0,
  retrievalMode: "",
  isProvisional: false,
  isDelta: false,
  trigger: "",
  subqueries: [],
  evidence: [],
  claims: [],
  citations: [],
  retrievalEvents: [],
  answer: "",
  uncertainty: "",
  uncertaintyFlag: false,
  answerVersion: 1,
  preservedClaimCount: 0,
  updatedClaimCount: 0,
  telemetry: null,
  activeStage: "",
  completedStages: [],
  error: null,
};

export function useRAGStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const abortRef = useRef<(() => void) | null>(null);
  const counterRef = useRef(0);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const addEvent = useCallback((event: string, data: any) => {
    const entry: PipelineEventLog = {
      id: `evt_${++counterRef.current}`,
      timestamp: Date.now(),
      event,
      data,
    };
    setState((prev) => ({ ...prev, events: [...prev.events, entry] }));
  }, []);

  const stream = useCallback(
    async (sessionId: string, transcriptChunk: string) => {
      // Abort any in-flight stream
      abortRef.current?.();

      setState({
        ...INITIAL_STATE,
        isStreaming: true,
        activeStage: "controller",
      });
      counterRef.current = 0;

      abortRef.current = await api.streamAnswer(
        sessionId,
        transcriptChunk,
        (eventName, data) => {
          addEvent(eventName, data);

          setState((prev) => {
            const next = { ...prev };

            switch (eventName) {
              case "decision":
                next.decision = data.decision ?? "";
                next.reason = data.reason ?? "";
                next.intentStability = data.intent_stability ?? 0;
                next.retrievalMode = data.retrieval_mode ?? "";
                next.isProvisional = data.is_provisional ?? false;
                next.isDelta = data.is_delta ?? false;
                next.trigger = data.trigger ?? "";
                next.completedStages = [...prev.completedStages, "controller"];
                if (data.decision === "RETRIEVE") {
                  next.activeStage = "decompose";
                } else {
                  next.activeStage = "";
                }
                break;

              case "retrieval_started":
                next.subqueries = data.subqueries ?? [];
                next.completedStages = [...prev.completedStages, "decompose"];
                next.activeStage = "retrieve";
                break;

              case "provisional":
                next.isProvisional = true;
                next.answerVersion = data.answer_version ?? 1;
                break;

              case "delta_retrieval":
                next.isDelta = true;
                next.answerVersion = data.answer_version ?? 1;
                break;

              case "evidence":
                next.evidence = data.citations ?? [];
                next.retrievalEvents = data.retrieval_events ?? [];
                next.completedStages = [
                  ...prev.completedStages,
                  "retrieve",
                  "fuse",
                  "rerank",
                ];
                next.activeStage = "synthesize";
                break;

              case "claims":
                next.claims = data.claims ?? [];
                break;

              case "uncertainty":
                next.uncertainty = data.message ?? "";
                next.uncertaintyFlag = true;
                break;

              case "ttft":
                next.telemetry = { ...prev.telemetry, ttft_ms: data.ttft_ms };
                break;

              case "token":
                next.answer = prev.answer + (data.token ?? "");
                break;

              case "complete":
                next.answerVersion = data.answer_version ?? 1;
                next.preservedClaimCount = data.preserved_claim_count ?? 0;
                next.updatedClaimCount = data.updated_claim_count ?? 0;
                next.citations = data.citations ?? [];
                next.telemetry = data.telemetry ?? {};
                next.evidence = data.evidence?.length
                  ? data.evidence
                  : prev.evidence;
                next.claims = data.claims?.length ? data.claims : prev.claims;
                next.completedStages = [
                  ...prev.completedStages,
                  "synthesize",
                ];
                next.activeStage = "";
                next.isStreaming = false;
                break;

              case "error":
                next.error = data.error ?? "Unknown error";
                next.isStreaming = false;
                next.activeStage = "";
                break;
            }

            return next;
          });
        },
        (error) => {
          setState((prev) => ({
            ...prev,
            error: error.message,
            isStreaming: false,
            activeStage: "",
          }));
        },
        () => {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            activeStage: "",
          }));
        }
      );
    },
    [addEvent]
  );

  const abort = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setState((prev) => ({ ...prev, isStreaming: false, activeStage: "" }));
  }, []);

  return { state, stream, abort, reset };
}
