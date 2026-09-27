import time
import json
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from src.config import settings


class TelemetryEvent(BaseModel):
    timestamp_s: float = Field(default_factory=time.time)
    session_id: str
    turn_id: str
    pipeline_stage: str
    transcript_chunk: str
    controller_decision: str
    intent_stability: float = 0.0
    controller_latency_ms: float = 0.0
    decomposition_latency_ms: float = 0.0
    dense_retrieval_latency_ms: float = 0.0
    sparse_retrieval_latency_ms: float = 0.0
    fusion_latency_ms: float = 0.0
    reranking_latency_ms: float = 0.0
    synthesis_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    ttft_ms: float = 0.0
    number_of_subqueries: int = 0
    number_of_retrieved_chunks: int = 0
    number_of_final_evidence_chunks: int = 0
    answer_version: int = 1
    answer_version_lineage: List[int] = Field(default_factory=list)
    citation_count: int = 0
    uncertainty_flag: bool = False
    uncertainty: str = ""
    synthesis_mode: str = "none"
    retrieval_mode: str = "none"
    is_provisional: bool = False
    is_delta: bool = False
    claim_count: int = 0
    grounded_claim_count: int = 0
    preserved_claim_count: int = 0
    updated_claim_count: int = 0
    tokens_in_estimate: int = 0
    tokens_out_estimate: int = 0
    token_usage: Dict[str, Any] = Field(default_factory=dict)
    retrieval_events: List[Dict[str, Any]] = Field(default_factory=list)
    stage_events: List[Dict[str, Any]] = Field(default_factory=list)
    extra: Dict[str, Any] = Field(default_factory=dict)


class TelemetryLogger:
    """
    Structured telemetry logger for the Streaming Live RAG pipeline.

    Every turn emits exactly one JSON trace with real (measured) timestamps,
    retrieval trigger events, citation counts, answer-version lineage and
    token/cost estimates. Traces are appended to logs/telemetry.jsonl and are
    queryable in memory for /metrics.
    """

    def __init__(self, session_id: Optional[str] = None, log_dir: Optional[str] = None):
        self.session_id = session_id or f"sess_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        self.log_dir = Path(log_dir or settings.LOG_DIR)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / "telemetry.jsonl"
        self.traces: List[Dict[str, Any]] = []
        self._version_lineage: Dict[str, List[int]] = {}

    def _lineage_for(self, session_id: str, answer_version: int) -> List[int]:
        lineage = self._version_lineage.setdefault(session_id, [])
        if answer_version not in lineage:
            lineage.append(answer_version)
        return list(lineage)

    def log_turn_event(self, event: TelemetryEvent) -> Dict[str, Any]:
        event.answer_version_lineage = self._lineage_for(event.session_id, event.answer_version)
        data = event.model_dump()
        self.traces.append(data)
        line = json.dumps(data)
        print(line)

        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

        return data

    def log_event(
        self,
        stage: str,
        transcript_chunk: str,
        decision: str,
        queries: Optional[list] = None,
        answer_version: int = 1,
        tokens_used: int = 0,
        extra: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        turn_id = f"turn_{len(self.traces) + 1}"
        event = TelemetryEvent(
            session_id=self.session_id,
            turn_id=turn_id,
            pipeline_stage=stage,
            transcript_chunk=transcript_chunk,
            controller_decision=decision,
            number_of_subqueries=len(queries) if queries else 0,
            answer_version=answer_version,
            tokens_out_estimate=tokens_used,
            synthesis_mode="legacy",
            extra=extra or {},
        )
        return self.log_turn_event(event)

    # ------------------------------------------------------------ coverage
    def trace_coverage(self) -> Dict[str, Any]:
        """Fraction of traces that carry the required observability fields."""
        required = (
            "controller_decision",
            "retrieval_mode",
            "answer_version",
            "total_latency_ms",
            "timestamp_s",
        )
        if not self.traces:
            return {"traces": 0, "coverage": 0.0, "complete": 0}
        complete = 0
        for trace in self.traces:
            if all(k in trace and trace[k] is not None for k in required):
                complete += 1
        return {
            "traces": len(self.traces),
            "complete": complete,
            "coverage": round(complete / len(self.traces), 4),
        }

    def export_traces(self) -> str:
        return json.dumps(self.traces, indent=2)
