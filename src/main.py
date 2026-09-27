import os
import json
import asyncio
import threading
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import settings
from src.pipeline import RAGPipeline

_pipeline: Optional[RAGPipeline] = None
_pipeline_lock = threading.Lock()


def get_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                _pipeline = RAGPipeline()
    return _pipeline


async def _bootstrap():
    pipeline = await asyncio.to_thread(get_pipeline)
    await asyncio.to_thread(pipeline.retriever.warm_up)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_bootstrap())
    yield
    task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Streaming Live RAG Engine for Samsung PRISM Hackathon Theme 4",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TurnRequest(BaseModel):
    session_id: Optional[str] = "default_session"
    transcript_chunk: str


class RetrieveRequest(BaseModel):
    session_id: Optional[str] = "default_session"
    query: str
    top_k: Optional[int] = 5


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/rag/ready")
def rag_ready():
    pipeline = get_pipeline()
    is_ready = pipeline.retriever.is_ready()
    chunk_count = len(pipeline.retriever.chunks)
    return {
        "ready": is_ready,
        "indexed_chunks": chunk_count,
        "corpus": "Aventro Motors",
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "status": "Aventro Motors corpus ready" if is_ready else "Corpus unavailable or empty",
    }


@app.post("/rag/ingest")
def ingest_corpus(force: bool = False):
    pipeline = get_pipeline()
    result = pipeline.retriever.load_or_ingest(force=force)
    return {
        "status": "success",
        "corpus": "Aventro Motors",
        "indexed_chunks": len(result.get("chunks", [])),
        "from_cache": result.get("from_cache", False),
        "dense_attached": result.get("dense_attached", False),
        "duration_s": result.get("duration_s", 0),
    }


@app.post("/rag/retrieve")
def retrieve(req: RetrieveRequest):
    pipeline = get_pipeline()
    if not pipeline.retriever.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Aventro Motors corpus unavailable or not indexed yet.",
        )
    return pipeline.retriever.search(req.query, top_k=req.top_k or settings.FINAL_TOP_K, rerank=True)


@app.post("/rag/answer")
def answer_turn(req: TurnRequest):
    pipeline = get_pipeline()
    session_id = req.session_id or "default_session"
    result = pipeline.process_turn(session_id, req.transcript_chunk)
    payload = result.model_dump()
    payload["output_record"] = result.output_record()
    return payload


async def sse_generator(session_id: str, transcript_chunk: str):
    try:
        async for event in get_pipeline().process_turn_stream(session_id, transcript_chunk):
            event_name = event["event"]
            data_str = json.dumps(event["data"])
            yield f"event: {event_name}\ndata: {data_str}\n\n"
            await asyncio.sleep(float(os.getenv("STREAM_TOKEN_DELAY_S", "0.005")))
    except Exception as e:
        err_payload = json.dumps({"error": str(e)})
        yield f"event: error\ndata: {err_payload}\n\n"


@app.post("/rag/answer/stream")
@app.post("/rag/stream")
async def answer_turn_stream(req: TurnRequest):
    session_id = req.session_id or "default_session"
    return StreamingResponse(
        sse_generator(session_id, req.transcript_chunk),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/rag/session/{session_id}")
def get_session(session_id: str):
    pipeline = get_pipeline()
    session = pipeline.memory_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@app.get("/metrics")
def get_metrics(limit: int = 100):
    pipeline = get_pipeline()
    traces = pipeline.telemetry_logger.traces
    return {
        "total_traces": len(traces),
        "trace_coverage": pipeline.telemetry_logger.trace_coverage(),
        "sessions": pipeline.memory_manager.session_count(),
        "traces": traces[-limit:],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
