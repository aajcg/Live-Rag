# System Architecture Brief - Streaming Live RAG (Samsung PRISM Theme 4)

This brief describes the architecture actually implemented in this repository. It maps
one-to-one onto the Theme 4 reference pipeline and documents the retrieval trigger logic,
decomposition strategy, data provenance, trade-offs and failure-mode mitigations.

## 1. Objectives

Standard batch RAG waits for a completed utterance, then retrieves. The Theme 4 target is
an event-driven engine that:

1. **Listens incrementally** - processes timestamped transcript chunks and predicts
   retrieval intent before the user stops speaking.
2. **Decomposes multi-intent queries** - isolates and parallelizes discrete sub-questions.
3. **Refines rather than restarts** - applies late constraints to existing answer state.
4. **Guarantees corpus grounding** - enforces provenance and citation checks and emits an
   explicit uncertainty indicator when evidence is insufficient.

## 2. Pipeline

```
INCOMING STREAM (timestamped transcript chunks)
        |
        v
[1] Retrieval Controller            intent-stability check -> WAIT | RETRIEVE | SUPPRESS
        |  (RETRIEVE, possibly early/provisional)
        v
[2] Multi-Intent Decomposer         atomic, de-duplicated, search-ready sub-queries
        |
        +----------------+----------------+
        v                v                v
     Query 1          Query 2   ...    Query N        (parallel intent routing)
        |                |                |
        +----------------+----------------+
        v
[3] Corpus Retrieval & Fusion
        Dense (ChromaDB + MiniLM embeddings)  +  Sparse (BM25, k1=1.5 b=0.75)
        -> Reciprocal Rank Fusion (k=60)
        -> Cross-Encoder re-rank (ms-marco-MiniLM-L-6, max_seq_length=256)
        -> per-intent balanced de-duplication
        v
[4] Session-Aware Synthesis
        extractive/LLM grounding -> claim-level citation check -> uncertainty flag
        v
STREAMED ANSWER + GROUNDED CITATIONS + OBSERVABILITY TELEMETRY (SSE)

Late detail:
NEW TRANSCRIPT -> session state -> delta scope -> delta retrieval
              -> affected claims updated, unaffected claims preserved -> Answer Version + 1
```

Implementation files:

| Component | Module |
|---|---|
| Controller (WAIT/RETRIEVE/SUPPRESS) | `src/controller.py` |
| Multi-intent decomposer | `src/decomposer.py` |
| Ingestion + page-aware chunking + chunk cache | `src/ingestion.py` |
| Dense + BM25 + RRF + reranker | `src/retrieval.py` |
| Session state, late-detail detection, delta query | `src/memory.py` |
| Grounding, citations, uncertainty, delta engine | `src/synthesis.py` |
| Event-driven orchestration | `src/pipeline.py` |
| Structured telemetry | `src/telemetry.py` |
| FastAPI + SSE | `src/main.py` |

## 3. Retrieval controller (retrieval trigger logic)

The controller is deterministic by default (optional LLM classification when a key is
configured; the heuristic policy is always the fallback). It computes:

* **content words** (stopword-filtered) - is there anything searchable at all?
* **entity/number signals** (capitalized non-stopwords, numeric literals)
* **continuation state** (ellipsis, dash, comma, semicolon, trailing conjunction)
* **terminal completeness** (`? ! .` vs open utterance)
* **intent stability score** (content + entity + completeness weighted, 0..1)

Decision policy:

1. `SUPPRESS` - anaphoric presentation-only requests (repeat/restate/reformat/bullets/
   shorten/summarize-that), conversational fillers. `retrieval_required=false`,
   `reason=presentation_restructure`.
2. `WAIT` - no searchable content, incomplete prefix without target, trailing conjunction
   before completion, continuation with no stable entities. No retrieval.
3. `RETRIEVE` - stable intent. If the utterance is still open but contains stable
   entities/numbers (e.g. "Pune", "30 people"), retrieval starts **early / provisionally**;
   otherwise it is a full retrieval.

This directly implements the guide's timeline: `WAIT` on an unstable fragment,
`PROVISIONAL RETRIEVE` as soon as entities stabilize, full decompose + parallel retrieve
when the utterance closes.

## 4. Multi-intent decomposition

Deterministic split on question marks, semicolons, commas and coordination conjunctions;
then:

* ellipsis/discourse normalization (`"I need to plan ... in..."`),
* leading/trailing filler stripping (`I need`, `please`, `can you`, `and`),
* viability filtering (a fragment needs >= 2 content words, a question word or a number;
  otherwise it merges back into the previous intent to avoid over-fragmentation),
* near-duplicate collapse (content-word Jaccard >= 0.8 keeps the more specific intent).

Chatty one-query examples decompose into orthogonal search intents; a simple query never
becomes several near-identical queries.

## 5. Retrieval, fusion and de-duplication

* **Sparse**: BM25 (rank_bm25 when installed; otherwise an equivalent pure-Python
  BM25Okapi implementation, k1=1.5, b=0.75) so the sparse leg is genuinely BM25 offline.
* **Dense**: persistent ChromaDB collection with `all-MiniLM-L6-v2` embeddings; the
  embedding model is lazily loaded and shared process-wide.
* **Fusion**: Reciprocal Rank Fusion `score = sum(1/(60+rank))` over both legs.
* **Rerank**: cross-encoder (`ms-marco-MiniLM-L-6-v2`, 256-token cap) with a composite
  lexical fallback when the model is unavailable.
* **De-duplication/balance**: chunks are unique by deterministic `chunk_id`; when more
  than one intent is active, evidence is selected round-robin per intent (max 2 per
  intent) so a dominant intent cannot starve the others.
* **Provenance**: every chunk carries `chunk_id`, `source_file`, `document_title`,
  `page_number`; the same metadata flows into citations and claims.

Parallel intent routing is real: one `ThreadPoolExecutor` task per sub-query, each running
the full dense+sparse+RRF+rerank path, with per-query timing events (no synthetic numbers).

## 6. Session-aware synthesis and the answer delta engine

`SessionState` is strictly per session id (no cross-session memory, no persistence between
independent runs). It stores transcript buffer, prior query/sub-queries, prior evidence,
prior answer, prior claims and prior citations, answer version, and constraints.

Late-detail detection fires when the utterance is a continuation of a provisional turn, a
qualifier/discourse-marker refinement ("only...", "actually...", "I mean..."), or a
statement-style constraint that shares topic vocabulary with the established session focus
without being a new question. Then:

* the search query becomes `prior focus | additional constraint: <delta>`,
* only the delta is decomposed and retrieved in parallel,
* prior and delta evidence are merged and re-ranked together,
* the delta engine marks a prior claim **affected** only when it intersects genuinely new
  constraint vocabulary; affected claims are replaced by newly grounded claims, all other
  claims are preserved verbatim with their original citations,
* the answer version increments once per answered turn.

## 7. Grounding, citations and uncertainty

* Claims are extracted sentences; grounding uses **directional content-word coverage**
  (>= 0.55 for multi-word claims, complete coverage for very short claims) against the
  cited chunk - not raw token overlap. Unsupported sentences are flagged `grounded=false`
  and get no chunk id.
* Weighted query coverage (< 0.45) or zero term coverage marks a sub-intent unverified;
  the response carries `uncertainty` text naming the unverifiable sub-intent.
* When no evidence sentence matches any intent, the pipeline returns an explicit
  insufficient-evidence answer with **zero citations** instead of presenting unrelated
  text as an answer.
* Citations are constructed only from actually retrieved chunks; fabricated chunk ids are
  impossible by construction (there is no citation generation path that does not consume
  retrieved evidence).

## 8. Corpus isolation and no hardcoding

There is no web search, no third-party API used for facts, no parametric-knowledge answer
path, and no benchmark-specific canned responses in the runtime. The optional OpenAI path
receives only retrieved evidence and is instructed to answer from it. Benchmark
expectations live exclusively in `benchmark/cases.py` and are never imported by `src/`.

## 9. Architectural parsimony / trade-offs

* No LangChain, no agent framework, no extra vector DB: the whole runtime is FastAPI +
  ChromaDB + sentence-transformers + stdlib.
* Deterministic heuristics by default keep the system fully offline and sub-second on the
  cheap stages; LLM calls are optional and never on the critical path for basic operation.
* The cross-encoder is CPU-bound (~0.6s after the 256-token cap for 12 candidates); early
  retrieval hides this behind the user's own speech time, which is exactly the Theme 4
  latency argument.
* Chunk caching (`data/index/chunks.json` + persisted Chroma) makes restarts cheap; the
  fingerprint covers file mtime/size and chunking parameters, so index staleness is
  detected automatically.

## 10. Failure modes and mitigations (pitfalls)

| Pitfall | Mitigation |
|---|---|
| Eager retrieval on noise | content/entity stability gate; benchmark measures a 0% false-trigger rate on unstable fragments |
| Context loss on late constraints | late-detail detection + delta query + preserved claims; state never cleared |
| Citation hallucination | citations/claims can only reference retrieved chunk ids; verifier recomputes support from the corpus |
| Ignoring presentation-only turns | anaphoric suppression patterns; zero retrieval events; prior citations retained, version unchanged |
| Over-fragmenting sub-queries | viability + Jaccard de-duplication; simple queries stay single-intent |
| Corpus gaps | explicit uncertainty with the uncovered sub-intent named; no unrelated answer text |
