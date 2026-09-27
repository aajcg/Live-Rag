# Streaming Live RAG Engine

> **Samsung PRISM GenAI Hackathon - Theme 4: Streaming Live RAG**
> Real-Time Incremental Retrieval, Multi-Intent Decomposition, and State-Preserving Answer Refinement

An offline-first, event-driven Streaming Live RAG engine in Python. As transcript chunks
stream in, the engine decides whether to **WAIT**, **RETRIEVE** (early/provisionally when
possible) or **SUPPRESS**, decomposes compound intents, performs hybrid dense+BM25
retrieval with RRF fusion and cross-encoder reranking, and synthesizes grounded answers
that are refined - not restarted - as late constraints arrive.

The authoritative behavioral specification is the Samsung Theme 4 guide
(`Theme 4 Guide_RAG.pdf`). See `docs/ARCHITECTURE.md` for the architecture brief and
`docs/TELEMETRY_SCHEMA.md` for the observability schema.

---

## Quickstart (one command)

```bash
# 1) install dependencies (Python 3.10+; tested on 3.14)
pip install -r requirements.txt          # or: pip install -r requirements.lock.txt

# 2) run everything through the single CLI entrypoint
python run.py ingest                     # build the corpus index (PDFs in data/aventro/pdf)
python run.py test                       # 70 automated tests (offline, ~1s)
python run.py demo                       # scripted live-streaming demonstration
python run.py serve                      # FastAPI + SSE server on :8000
python run.py benchmark                  # G2-G6 benchmark harness + report
```

Docker alternative:

```bash
docker compose up --build               # serves http://localhost:8000
```

---

## Corpus and indexing

The bundled corpus is the **Aventro Motors** PDF set in `data/aventro/pdf/` (50 documents).
Ingestion extracts text page-by-page (PyMuPDF, pypdf fallback), chunks by words with
overlap (`CHUNK_SIZE=600`, `CHUNK_OVERLAP=100`), and assigns deterministic chunk ids
(`chk_<md5>`). Chunks are cached in `data/index/chunks.json` behind a corpus fingerprint
(file names/sizes/mtimes + chunking parameters); the dense index is persisted in
`data/chroma`. A restart reuses both and only re-embeds when the fingerprint or collection
count diverges.

All retrieved evidence comes exclusively from this corpus. There is no web search and no
external knowledge path.

---

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/rag/ready` | Readiness + indexed chunk count |
| `POST` | `/rag/ingest?force=false` | Build/refresh the index (cached by default) |
| `POST` | `/rag/retrieve` | Direct hybrid retrieval (no synthesis) |
| `POST` | `/rag/answer` | Synchronous transcript turn (returns `output_record`) |
| `POST` | `/rag/answer/stream` / `/rag/stream` | Server-Sent Events stream |
| `GET` | `/rag/session/{session_id}` | Inspect session state (strictly session-scoped) |
| `GET` | `/metrics` | Telemetry traces + trace coverage |

SSE event order: `decision` -> `retrieval_started` -> (`provisional` | `delta_retrieval`) ->
`evidence` -> `claims` -> (`uncertainty`) -> `ttft` -> `token`... -> `complete`.
`retrieval_started` is emitted before any retrieval work runs; `ttft` is the measured
first-token-ready latency.

Example:

```bash
curl -X POST http://localhost:8000/rag/answer -H "Content-Type: application/json" -d "{\"session_id\":\"demo\",\"transcript_chunk\":\"What does the ABS warning indicate?\"}"
```

---

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | empty | Optional. When set, controller/decomposer/synthesis may use an LLM; the deterministic offline path always remains the fallback |
| `LOCAL_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Dense embedding model |
| `RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Reranker |
| `RERANK_MAX_LENGTH` | `256` | Reranker token cap (latency control) |
| `ENABLE_RERANKER` | `true` | Toggle reranking |
| `AVENTRO_PDF_DIR` | `data/aventro/pdf` | Corpus directory |
| `CHROMA_DIR` / `INDEX_DIR` | `data/chroma` / `data/index` | Persisted indexes |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `600` / `100` | Chunking |
| `DENSE_TOP_K` / `SPARSE_TOP_K` | `10` / `10` | Per-leg candidates |
| `RRF_K` / `RRF_TOP_K` / `RERANK_MAX_CANDIDATES` | `60` / `12` / `12` | Fusion + rerank budget |
| `MAX_RETRIEVAL_CHUNKS` | `5` | Final evidence size |
| `STREAM_TOKEN_DELAY_S` | `0.005` | SSE token pacing for demos |

**Offline-first:** ingestion, BM25 (pure-Python BM25Okapi fallback), dense retrieval
(chroma lexical fallback if models are unavailable), fusion, reranking (composite
fallback), controller, decomposition, session memory, grounding, citations and telemetry
all work with no API key and no network.

---

## Benchmark (G2-G6)

`python run.py benchmark` drives the real pipeline against held-out expectations in
`benchmark/cases.py` (expectations only - no canned answers anywhere) and writes
`benchmark/results/benchmark_results.json` plus `BENCHMARK_REPORT.md`.

| Gate | Criterion | Target | Measured (2026-09-27, 133 chunks) |
|---|---|---|---|
| G1 | Reproducibility | pass/fail | `python run.py ingest/test/demo/serve` (single command each); Dockerfile + lockfile included |
| G2 | Early retrieval | >= 80% | **100%** (2/2 eligible); 0% false triggers on unstable fragments |
| G3 | Multi-intent identification | >= 70% | **100%** (2/2 compound cases, no near-duplicates) |
| G4 | Factual grounding | >= 85% | **100%** claim support (43/43 verified claims), 0 fabricated citations |
| G5 | Session refinement | verified | **2/2** delta refinements, prior claims preserved, version +1 |
| G6 | Telemetry & observability | 100% | **100%** trace coverage (complete traces only) |

The report also contains two architectures ablations and an edge-case analysis (corpus
gap uncertainty, partial multi-intent coverage, provisional version lineage, latency
profile); see `benchmark/results/BENCHMARK_REPORT.md`.

> Rerun the benchmark to regenerate numbers for your machine; never trust stale results.

---

## Tests

```bash
python run.py test          # 70 tests, offline-fast, ~1s
python -m pytest -v         # same with details
```

Coverage includes: controller WAIT/RETRIEVE/SUPPRESS/early-retrieval, decomposer
atomicity and de-duplication, BM25/RRF/rerank/dedupe/balance, session isolation,
late-detail delta, answer versions, claim grounding and citation validity, uncertainty,
SSE ordering, telemetry coverage and offline operation. Integration tests use the real
corpus wherever practical.

---

## Repository layout

```
run.py                      Single-command CLI (ingest/serve/demo/benchmark/test)
src/
  config.py                 Pydantic settings
  controller.py             Intent-stability controller (WAIT/RETRIEVE/SUPPRESS)
  decomposer.py             Multi-intent decomposition + de-duplication
  ingestion.py              PDF extraction, page-aware chunking, chunk cache
  retrieval.py              Dense + BM25 + RRF + reranker + balanced evidence
  memory.py                 Session state, late-detail detection, delta querying
  synthesis.py              Grounding, citations, uncertainty, delta answer engine
  pipeline.py               Event-driven orchestration (provisional/delta/parallel intents)
  telemetry.py              Structured traces + coverage
  main.py                   FastAPI app + SSE
benchmark/                  Held-out cases + G2-G6 harness + results
scripts/demo.py             Scripted end-to-end demonstration
docs/                       Architecture brief + telemetry schema
tests/                      Automated test suite
data/aventro/pdf/           Aventro Motors corpus (50 PDFs)
data/chroma/                Persistent dense index
data/index/chunks.json      Cached chunks (fingerprint-validated)
```

---

## Limitations

- **Text transcripts only.** Audio/full-duplex input requires an upstream STT stage.
- **Offline synthesis is extractive.** Without an LLM key the engine returns grounded
  evidence sentences with citations plus uncertainty flags; it never invents prose.
- **CPU reranking cost.** Cross-encoder reranking is capped (`RERANK_MAX_LENGTH=256`,
  12 candidates) but still dominates latency (measured ~0.32-0.39s warm in isolation,
  ~1.4s under benchmark load on this machine); early provisional retrieval is what hides
  it behind the user's own speech time.
- **Single-process session memory.** Session state is in-process and strictly scoped by
  session id; running multiple workers means a session should be pinned to one worker.
- The Docker image is defined and healthchecked but was not built in the audit
  environment (Docker unavailable there); the verified one-command path is `run.py`.
