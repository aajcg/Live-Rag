import { z } from "zod";

// Controller decision enum
export const ControllerDecisionEnum = z.enum(["WAIT", "RETRIEVE", "SUPPRESS"]);
export type ControllerDecision = z.infer<typeof ControllerDecisionEnum>;

// SSE Event types
export const SSEEventType = z.enum([
  "decision",
  "retrieval_started",
  "provisional",
  "delta_retrieval",
  "evidence",
  "claims",
  "uncertainty",
  "ttft",
  "token",
  "complete",
]);
export type SSEEventType = z.infer<typeof SSEEventType>;

// Base SSE event
export const SSEEvent = z.object({
  event: SSEEventType,
  data: z.unknown(),
});
export type SSEEvent = z.infer<typeof SSEEvent>;

// Decision event data
export const DecisionEventData = z.object({
  decision: ControllerDecisionEnum,
  reason: z.string(),
  retrieval_required: z.boolean(),
  trigger: z.string(),
  intent_stability: z.number().optional(),
  query: z.string(),
  retrieval_mode: z.string(),
  is_provisional: z.boolean(),
  is_delta: z.boolean(),
});
export type DecisionEventData = z.infer<typeof DecisionEventData>;

// Retrieval started event data
export const RetrievalStartedEventData = z.object({
  subqueries: z.array(z.string()),
  mode: z.string(),
  trigger: z.string(),
});
export type RetrievalStartedEventData = z.infer<typeof RetrievalStartedEventData>;

// Evidence event data
export const RetrievedChunk = z.object({
  chunk_id: z.string(),
  text: z.string(),
  source_document: z.string(),
  page_number: z.number().optional(),
  retrieval_score: z.number(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunk>;

export const EvidenceEventData = z.object({
  count: z.number(),
  retrieval_events: z.array(z.any()),
  citations: z.array(z.any()),
});
export type EvidenceEventData = z.infer<typeof EvidenceEventData>;

// Claim data
export const Claim = z.object({
  text: z.string(),
  grounded: z.boolean(),
  chunk_ids: z.array(z.string()),
});
export type Claim = z.infer<typeof Claim>;

export const ClaimsEventData = z.object({
  claims: z.array(Claim),
});
export type ClaimsEventData = z.infer<typeof ClaimsEventData>;

// Citation data
export const Citation = z.object({
  chunk_id: z.string(),
  label: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

// TTFT event data
export const TTFTEventData = z.object({
  ttft_ms: z.number(),
});
export type TTFTEventData = z.infer<typeof TTFTEventData>;

// Token event data
export const TokenEventData = z.object({
  token: z.string(),
});
export type TokenEventData = z.infer<typeof TokenEventData>;

// Complete event data (full turn result)
export const TurnResult = z.object({
  session_id: z.string(),
  turn_id: z.string(),
  decision: z.string(),
  reason: z.string(),
  query: z.string(),
  subqueries: z.array(z.string()),
  answer: z.string(),
  citations: z.array(z.any()),
  evidence: z.array(RetrievedChunk),
  claims: z.array(Claim),
  uncertainty_flag: z.boolean(),
  uncertainty: z.string(),
  answer_version: z.number(),
  synthesis_mode: z.string(),
  retrieval_mode: z.string(),
  retrieval_required: z.boolean(),
  is_provisional: z.boolean(),
  is_delta: z.boolean(),
  preserved_claim_count: z.number(),
  updated_claim_count: z.number(),
  retrieval_events: z.array(z.any()),
  token_usage: z.any(),
  telemetry: z.any(),
});
export type TurnResult = z.infer<typeof TurnResult>;

// API request/response types
export const AnswerRequest = z.object({
  session_id: z.string(),
  transcript_chunk: z.string(),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const RetrieveRequest = z.object({
  query: z.string(),
  top_k: z.number().optional(),
});
export type RetrieveRequest = z.infer<typeof RetrieveRequest>;

export const HealthResponse = z.object({
  status: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ReadyResponse = z.object({
  ready: z.boolean(),
  chunk_count: z.number(),
});
export type ReadyResponse = z.infer<typeof ReadyResponse>;

export const SessionResponse = z.object({
  session_id: z.string(),
  transcript_buffer: z.string(),
  answer_version: z.number(),
  previous_answer: z.string().nullable(),
  previous_subqueries: z.array(z.string()),
  previous_evidence: z.array(z.any()),
  previous_claims: z.array(z.any()),
  previous_citations: z.array(z.any()),
});
export type SessionResponse = z.infer<typeof SessionResponse>;
