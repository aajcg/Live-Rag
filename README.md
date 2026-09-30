# 🔴 Live Streaming RAG Engine

> **Samsung PRISM Hackathon — Theme 4**
> A real-time, session-aware Retrieval-Augmented Generation pipeline that processes live speech transcripts and returns grounded, cited answers over Server-Sent Events (SSE).

---

## ✨ Features

| Capability | Details |
|---|---|
| **Live transcript ingestion** | Accepts streaming transcript chunks turn-by-turn |
| **Intent-stability controller** | Decides `RETRIEVE / WAIT / SUPPRESS` per turn with LLM + heuristic fallback |
| **Multi-intent decomposition** | Splits complex queries into parallel sub-queries |
| **Hybrid retrieval** | Dense (SentenceTransformer) + Sparse (BM25) fused with Reciprocal Rank Fusion (RRF) |
| **Cross-encoder reranking** | `cross-encoder/ms-marco-MiniLM-L-6-v2` for precision boosting |
| **Claim-grounded synthesis** | Sentence-level claim extraction, grounding, and citation generation |
| **Delta retrieval** | Late-detail turns trigger targeted updates to affected claims only |
| **Provisional answers** | Incomplete utterances get early provisional answers that are refined |
| **Session memory** | Per-session transcript buffer, evidence, claims, and citation carry-over |
| **SSE streaming** | Answers streamed token-by-token with `event: token` events |
| **Telemetry** | Per-turn latency, token estimates, cost estimates, and trace logs |
| **Next.js frontend** | Live dashboard with Framer Motion animations |
| **Docker** | Single-container deployment via `docker-compose` |

---

## 🏗️ Architecture

```
Live Transcript Chunk
        │
        ▼
┌───────────────────────┐
│  RetrievalController  │  ─── WAIT / RETRIEVE / SUPPRESS
└───────────────────────┘
        │ RETRIEVE
        ▼
┌────────────────────┐
│   QueryDecomposer  │  ─── Multi-intent sub-query splitting
└────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│           HybridRetriever                 │
│  ┌──────────────┐  ┌───────────────────┐ │
│  │ Dense Search  │  │   Sparse BM25     │ │
│  │ (ChromaDB +   │  │   (TF-IDF index)  │ │
│  │  SentTrans)   │  │                   │ │
│  └──────────────┘  └───────────────────┘ │
│         │   Reciprocal Rank Fusion (RRF)  │
│         ▼                                 │
│    Cross-Encoder Reranker                 │
└──────────────────────────────────────────┘
        │
        ▼
┌───────────────────┐
│  AnswerSynthesizer│  ─── Claim grounding + citation labelling
└───────────────────┘
        │
        ▼
   SSE Stream  →  FastAPI  →  Next.js Frontend
   (token | evidence | claims | complete)
```

---

## 📁 Project Structure

```
Live-Rag/
├── src/
│   ├── main.py           # FastAPI application + SSE endpoints
│   ├── pipeline.py       # RAGPipeline orchestrator (process_turn / process_turn_stream)
│   ├── controller.py     # RetrievalController (WAIT | RETRIEVE | SUPPRESS)
│   ├── decomposer.py     # Multi-intent query decomposer
│   ├── retrieval.py      # HybridRetriever — dense + BM25 + RRF + reranker
│   ├── ingestion.py      # PDF corpus ingestion + chunking engine
│   ├── synthesis.py      # AnswerSynthesizer — claim grounding + citations
│   ├── memory.py         # SessionMemoryManager — per-session state
│   ├── telemetry.py      # TelemetryLogger — latency, token & cost tracing
│   ├── jev_client.py     # TypeSafe Jev API client (Choice / Score / Noul)
│   └── config.py         # Pydantic-settings config (loaded from .env)
│
├── frontend/             # Next.js 14 dashboard
│   └── src/
│       ├── app/          # Next.js App Router pages
│       ├── components/   # UI components (Framer Motion, Lucide icons)
│       ├── hooks/        # Custom React hooks
│       └── utils/        # SSE client helpers
│
├── benchmark/
│   ├── run_benchmark.py  # G2–G6 benchmark harness
│   └── cases.py          # Benchmark test cases
│
├── scripts/
│   └── demo.py           # Scripted live-streaming demonstration
│
├── tests/                # pytest test suite
├── data/                 # Corpus PDFs + ChromaDB index + BM25 index (git-ignored)
├── logs/                 # Telemetry logs (git-ignored)
│
├── run.py                # Unified CLI: ingest | serve | demo | benchmark | test
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

---

## 🚀 Quick Start

### Prerequisites

- Python **3.12+**
- Node.js **18+** (for the frontend)
- An **OpenAI API key** (`gpt-4o-mini` is the default model)
- _(Optional)_ **JEV API key** from [TypeSafe.ai](https://typesafe.ai) for the LLM controller

### 1 — Clone & Install

```bash
git clone https://github.com/<your-org>/Live-Rag.git
cd Live-Rag

python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2 — Configure Environment

Create a `.env` file in the project root:

```env
# Required
OPENAI_API_KEY=sk-...

# Optional — JEV API for LLM-powered controller
JEV_API_KEY=your_jev_api_key_here

# Model selection
LLM_MODEL=gpt-4o-mini
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Reranker (runs locally via sentence-transformers)
ENABLE_RERANKER=true
RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2

# Paths
DATA_DIR=data
CORPUS_DIR=data/aventro/pdf
CHROMA_DIR=data/chroma
INDEX_DIR=data/index

# Retrieval tuning
CHUNK_SIZE=600
CHUNK_OVERLAP=100
DENSE_TOP_K=10
SPARSE_TOP_K=10
RRF_K=60
FINAL_TOP_K=5
STABILITY_CONFIDENCE_THRESHOLD=0.75
```

### 3 — Add Your Corpus

Place PDF documents in `data/aventro/pdf/` (or the path set by `CORPUS_DIR`).

### 4 — Ingest the Corpus

```bash
python run.py ingest
# Force full re-extraction if the corpus changed:
python run.py ingest --force
```

### 5 — Start the API Server

```bash
python run.py serve
# Runs at http://localhost:8000
# With hot-reload:
python run.py serve --reload
```

### 6 — Start the Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

---

## 🐳 Docker

```bash
# Set your key in the environment or .env, then:
docker-compose up --build
```

The API will be available at `http://localhost:8000`.

> The container health-check polls `GET /rag/ready` and waits up to 240 s for the embedding models to warm up.

---

## 🔌 API Reference

Base URL: `http://localhost:8000`

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/rag/ready` | Corpus readiness + chunk count |

### Corpus Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/rag/ingest?force=false` | Trigger (re-)ingestion |

### RAG Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/rag/answer` | Synchronous turn — returns full `TurnResult` JSON |
| `POST` | `/rag/answer/stream` | **SSE streaming** turn (recommended) |
| `POST` | `/rag/retrieve` | Raw retrieval — returns ranked evidence chunks |

### Session & Telemetry

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/rag/session/{session_id}` | Inspect session state |
| `GET` | `/metrics?limit=100` | Telemetry traces |

### Request Body (`/rag/answer` and `/rag/answer/stream`)

```json
{
  "session_id": "user-session-001",
  "transcript_chunk": "What is the warranty coverage for Aventro EV?"
}
```

---

## 📡 SSE Event Stream

When using `POST /rag/answer/stream`, the server emits the following sequence of events:

```
event: decision
data: {"decision": "RETRIEVE", "retrieval_mode": "full", "intent_stability": 0.92, ...}

event: retrieval_started
data: {"subqueries": ["warranty coverage Aventro EV", "EV battery warranty"], "mode": "full"}

event: evidence
data: {"count": 5, "citations": [...], "retrieval_events": [...]}

event: claims
data: {"claims": [{"text": "...", "grounded": true, "source": "aventro_manual.pdf", "page": 12}]}

event: ttft
data: {"ttft_ms": 340.5}

event: token
data: {"token": "The "}

event: token
data: {"token": "Aventro "}

... (one event per word)

event: complete
data: { ...full TurnResult... }
```

**Controller decisions:**

| Decision | Meaning |
|----------|---------|
| `RETRIEVE` | Query is complete and novel — full retrieval + synthesis triggered |
| `WAIT` | Transcript is incomplete (trailing conjunction, mid-sentence) |
| `SUPPRESS` | Presentation-only reformulation (e.g. "show as bullets", "summarize") |

---

## 🧠 Retrieval Pipeline Deep-Dive

```
Query
  │
  ├─► [Dense]  SentenceTransformer → ChromaDB cosine search (top-K)
  │
  ├─► [Sparse] BM25 TF-IDF index search (top-K)
  │
  └─► Reciprocal Rank Fusion (RRF, k=60)
          │
          └─► Cross-Encoder reranker → final top-N chunks → Synthesis
```

- **Multi-intent**: Each sub-query runs the full pipeline in parallel threads; results are merged, deduplicated, and globally reranked.
- **Delta turns**: Fresh chunks are merged with session evidence and globally reranked to update only affected claims.
- **Provisional turns**: Early retrieval is triggered before the utterance fully closes; the answer is transparently marked provisional and upgraded on the next complete turn.

---

## 🛠️ CLI Reference

```bash
python run.py <command> [options]
```

| Command | Options | Description |
|---------|---------|-------------|
| `ingest` | `--force` | Build or refresh the corpus index |
| `serve` | `--host`, `--port`, `--reload` | Start the FastAPI server |
| `demo` | `--fast` | Run the scripted live-streaming demo |
| `benchmark` | — | Run the G2–G6 benchmark harness |
| `test` | `--verbose` | Run the pytest test suite |

---

## 🧪 Testing & Benchmarking

```bash
# Run tests
python run.py test

# Run with verbose output
python run.py test --verbose

# Run benchmark harness (G2–G6 scenarios)
python run.py benchmark
```

Benchmark results are written to `benchmark/results/`.

---

## ⚙️ Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key (required for synthesis) |
| `JEV_API_KEY` | — | TypeSafe Jev API key (optional) |
| `LLM_MODEL` | `gpt-4o-mini` | OpenAI model used for synthesis |
| `EMBEDDING_PROVIDER` | `local` | `local` or `openai` |
| `LOCAL_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | HuggingFace SentenceTransformer model |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model (if provider=openai) |
| `ENABLE_RERANKER` | `true` | Toggle cross-encoder reranking |
| `RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | HuggingFace cross-encoder |
| `CHUNK_SIZE` | `600` | Token chunk size for ingestion |
| `CHUNK_OVERLAP` | `100` | Overlap between consecutive chunks |
| `DENSE_TOP_K` | `10` | Candidates from dense retrieval |
| `SPARSE_TOP_K` | `10` | Candidates from BM25 retrieval |
| `RRF_K` | `60` | RRF fusion smoothing constant |
| `FINAL_TOP_K` | `5` | Final chunks passed to synthesis |
| `MAX_RETRIEVAL_CHUNKS` | `5` | Max chunks in evidence pool |
| `STABILITY_CONFIDENCE_THRESHOLD` | `0.75` | Controller intent stability threshold |

---

## 🧩 Module Overview

| Module | Role |
|--------|------|
| `src/config.py` | Pydantic-settings — all config loaded from `.env` |
| `src/controller.py` | Heuristic + LLM-backed WAIT / RETRIEVE / SUPPRESS decider |
| `src/decomposer.py` | Multi-intent query decomposition via rules + optional LLM |
| `src/ingestion.py` | PDF parsing (PyMuPDF), chunking, BM25 + ChromaDB indexing |
| `src/retrieval.py` | Hybrid retrieval: dense + sparse + RRF + cross-encoder reranker |
| `src/memory.py` | Session state: transcript buffer, evidence, claims, citations |
| `src/synthesis.py` | Claim extraction, grounding, uncertainty flags, citation labels |
| `src/pipeline.py` | End-to-end orchestrator; sync `process_turn` + async SSE stream |
| `src/telemetry.py` | Structured per-turn event logging and trace aggregation |
| `src/jev_client.py` | TypeSafe Jev API client (Choice / Score / Noul primitives) |
| `src/main.py` | FastAPI app with SSE, REST, and CORS middleware |

---

## 📦 Tech Stack

**Backend**
- Python 3.12
- FastAPI + Uvicorn (REST + SSE)
- ChromaDB (dense vector store)
- SentenceTransformers (local embeddings + cross-encoder)
- PyMuPDF (PDF ingestion)
- Pydantic v2 + pydantic-settings

**Frontend**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion
- TanStack Query
- Lucide React

---

## 📝 License

This project was built for the **Samsung PRISM Hackathon — Theme 4 (Live RAG)**.

---

> Built with ❤️ by the Live-RAG team · SRM Institute of Science and Technology
