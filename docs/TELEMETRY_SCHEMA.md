# Telemetry & Observability Schema

Every turn emits exactly one structured `TelemetryEvent` JSON line to stdout and to
`logs/telemetry.jsonl`. Traces are also kept in memory for `/metrics`. All timings are
measured with `time.time()` around the real work; nothing is fabricated.

`/metrics` returns `total_traces`, `trace_coverage` and the most recent traces.

## 1. Turn trace (`TelemetryEvent`)

| Field | Type | Meaning |
|---|---|---|
| `timestamp_s` | float | Unix time when the trace was finalized |
| `session_id` | str | Session scope (never shared across sessions) |
| `turn_id` | str | Unique turn id |
| `pipeline_stage` | str | `controller_wait`, `controller_suppress` or `turn_processing` |
| `transcript_chunk` | str | Raw chunk that arrived in this turn |
| `controller_decision` | str | `WAIT` \| `RETRIEVE` \| `SUPPRESS` |
| `intent_stability` | float | Controller intent-stability score (0..1) |
| `controller_latency_ms` | float | Controller evaluation latency |
| `decomposition_latency_ms` | float | Multi-intent decomposition latency |
| `dense_retrieval_latency_ms` | float | Actual dense-leg time (summed over parallel intents) |
| `sparse_retrieval_latency_ms` | float | Actual BM25 time (summed over parallel intents) |
| `fusion_latency_ms` | float | Actual RRF time (summed over parallel intents) |
| `reranking_latency_ms` | float | Actual cross-encoder/composite rerank time |
| `synthesis_latency_ms` | float | Grounded synthesis time |
| `total_latency_ms` | float | Turn start -> result ready |
| `ttft_ms` | float | Turn start -> answer ready to stream (first-token-ready) |
| `number_of_subqueries` | int | Displayed intents (including preserved session intents) |
| `number_of_retrieved_chunks` | int | Post-fusion candidates |
| `number_of_final_evidence_chunks` | int | Evidence after de-dup/balance/rerank |
| `answer_version` | int | Answer version produced by this turn |
| `answer_version_lineage` | list[int] | Ordered versions for the session so far |
| `citation_count` | int | Citations in the response |
| `uncertainty_flag` / `uncertainty` | bool / str | Explicit uncertainty state and reason |
| `synthesis_mode` | str | `extractive_fallback`, `delta_refinement`, `insufficient_evidence`, `suppress_contextual`, `wait_incomplete`, `corpus_unavailable` |
| `retrieval_mode` | str | `full` \| `provisional` \| `delta` \| `suppress` \| `wait` |
| `is_provisional` / `is_delta` | bool | Early retrieval / late-detail refinement flags |
| `claim_count` / `grounded_claim_count` | int | Claim-level grounding statistics |
| `preserved_claim_count` / `updated_claim_count` | int | Answer delta engine statistics |
| `tokens_in_estimate` / `tokens_out_estimate` | int | Context/output token estimates (chars/4) |
| `token_usage` | object | `{mode, tokens_in_estimate, tokens_out_estimate, estimated_cost_usd}` |
| `retrieval_events` | list | Per-sub-query retrieval trigger events (below) |
| `stage_events` | list | Reserved for additional stage instrumentation |
| `extra` | object | Extension bag |

## 2. Retrieval event

One entry per decomposed sub-query actually searched:

```json
{
  "timestamp_s": 0.002,
  "query": "what is the cancellation policy?",
  "trigger": "multi_intent",
  "dense_ms": 13.77,
  "sparse_ms": 5.23,
  "fusion_ms": 0.24,
  "rerank_ms": 4.36,
  "candidates": 12,
  "results": 5
}
```

`trigger` is `full`, `provisional`, `multi_intent` or `delta`.

## 3. Structured output event record

Every answer (sync and SSE `complete`) carries `output_record` in the guide's shape:

```json
{
  "retrieval_events": [ { "timestamp_s": 0.8, "query": "...", "trigger": "provisional" } ],
  "sub_queries": ["venue capacity for 30 attendees in Pune", "..."],
  "answer": "...",
  "citations": ["warranty_guide.pdf §p2"],
  "uncertainty": ""
}
```

Additional machine-readable fields on the same payload: `claims` (with `chunk_id`,
`source`, `page`, `support_score`, `updated`), `evidence` (full chunk metadata),
`token_usage`, `answer_version`, `retrieval_mode`, `is_provisional`, `is_delta`.

## 4. Trace coverage definition

`TelemetryLogger.trace_coverage()` counts a trace as complete when it carries
`controller_decision`, `retrieval_mode`, `answer_version`, `total_latency_ms` and
`timestamp_s`. The benchmark additionally requires every `RETRIEVE` trace to contain at
least one `retrieval_events` entry and `number_of_subqueries >= 1`, and every `SUPPRESS`
trace to have `retrieval_mode == "suppress"`. Both measured 100% on the held-out
benchmark suite.

## 5. SSE event stream (ordered)

1. `decision` - controller result, `retrieval_required`, `trigger`, `intent_stability`.
2. `retrieval_started` - emitted **before** retrieval work begins, carries sub-queries.
3. `provisional` - set when an early answer is issued before utterance completion.
4. `delta_retrieval` - set when late-detail delta retrieval ran.
5. `evidence` - counts, retrieval events, citations.
6. `claims` - claim-level grounding result.
7. `uncertainty` - only when evidence is insufficient/partial.
8. `ttft` - first-token-ready latency in ms.
9. `token` - answer stream chunks.
10. `complete` - full turn payload including `output_record` and telemetry.
11. `error` - error details if an exception occurs.
