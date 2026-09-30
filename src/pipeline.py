import time
import uuid
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field

from src.config import settings
from src.controller import RetrievalController, ControllerDecisionEnum, ControllerResult
from src.decomposer import QueryDecomposer, SubQuery
from src.retrieval import HybridRetriever, RetrievedChunk
from src.memory import SessionMemoryManager, SessionState
from src.synthesis import AnswerSynthesizer, GroundedAnswer, Citation, Claim
from src.telemetry import TelemetryLogger, TelemetryEvent

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
}


class TurnResult(BaseModel):
    session_id: str
    turn_id: str
    decision: str
    reason: str
    query: str
    subqueries: List[str] = Field(default_factory=list)
    answer: str
    citations: List[Citation] = Field(default_factory=list)
    evidence: List[RetrievedChunk] = Field(default_factory=list)
    claims: List[Claim] = Field(default_factory=list)
    uncertainty_flag: bool = False
    uncertainty: str = ""
    answer_version: int = 1
    synthesis_mode: str = "none"
    retrieval_mode: str = "none"
    retrieval_required: bool = True
    is_provisional: bool = False
    is_delta: bool = False
    preserved_claim_count: int = 0
    updated_claim_count: int = 0
    retrieval_events: List[Dict[str, Any]] = Field(default_factory=list)
    token_usage: Dict[str, Any] = Field(default_factory=dict)
    telemetry: Dict[str, Any] = Field(default_factory=dict)

    def output_record(self) -> Dict[str, Any]:
        """Spec-structured output event record."""
        return {
            "retrieval_events": self.retrieval_events,
            "sub_queries": self.subqueries,
            "answer": self.answer,
            "citations": [c.label or c.chunk_id for c in self.citations],
            "uncertainty": self.uncertainty,
        }


@dataclass
class PreparedTurn:
    session: SessionState
    session_id: str
    turn_id: str
    transcript_chunk: str
    current_transcript: str
    ctrl_result: ControllerResult
    turn_start: float
    is_delta: bool = False
    is_provisional: bool = False
    retrieval_mode: str = "none"
    refined_query: str = ""
    subquery_objs: List[SubQuery] = field(default_factory=list)
    displayed_subqueries: List[str] = field(default_factory=list)
    delta_seed: str = ""
    controller_latency_ms: float = 0.0
    decomposition_latency_ms: float = 0.0


def _utterance_is_provisional(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    if t.endswith(("...", "\u2026")):
        return True
    return not t.endswith(("?", "!", "."))


def _session_chunks(session: SessionState) -> List[RetrievedChunk]:
    chunks: List[RetrievedChunk] = []
    for item in session.previous_evidence:
        if isinstance(item, dict):
            try:
                chunks.append(RetrievedChunk(**item))
            except Exception:
                continue
    return chunks


def _refine_evidence_with_session(
    evidence: List[RetrievedChunk],
    constraint_terms: List[str],
) -> List[RetrievedChunk]:
    if not evidence or not constraint_terms:
        return evidence
    lowered_terms = [t.lower() for t in constraint_terms if t]

    def sort_key(chunk: RetrievedChunk):
        text = chunk.text.lower()
        boost = sum(1 for term in lowered_terms if term in text)
        return (boost, chunk.retrieval_score)

    return sorted(evidence, key=sort_key, reverse=True)


class RAGPipeline:
    """
    Streaming Live RAG pipeline:

    transcript -> controller (WAIT | RETRIEVE | SUPPRESS)
      -> early/provisional retrieval -> multi-intent decomposition
      -> parallel dense + BM25 -> RRF -> reranker
      -> evidence fusion -> session-aware synthesis -> claim grounding
      -> answer vN -> late-detail delta retrieval -> answer vN+1
      -> SSE + citations + telemetry
    """

    def __init__(
        self,
        retriever: Optional[HybridRetriever] = None,
        controller: Optional[RetrievalController] = None,
        decomposer: Optional[QueryDecomposer] = None,
        synthesizer: Optional[AnswerSynthesizer] = None,
        memory_manager: Optional[SessionMemoryManager] = None,
        auto_ingest: bool = True,
    ):
        self.retriever = retriever or HybridRetriever()
        self.controller = controller or RetrievalController(
            api_key=settings.JEV_API_KEY or settings.OPENAI_API_KEY, 
            use_llm=True
        )
        self.decomposer = decomposer or QueryDecomposer(api_key=settings.OPENAI_API_KEY)
        self.synthesizer = synthesizer or AnswerSynthesizer(api_key=settings.OPENAI_API_KEY)
        self.memory_manager = memory_manager or SessionMemoryManager()
        self.telemetry_logger = TelemetryLogger()

        if auto_ingest and not self.retriever.is_ready():
            try:
                self.retriever.load_or_ingest()
            except Exception as e:
                print(f"Initial corpus indexing check: {e}")

    # ---------------------------------------------------------------- prepare
    def _prepare_turn(self, session_id: str, transcript_chunk: str) -> PreparedTurn:
        turn_start = time.time()
        turn_id = f"turn_{uuid.uuid4().hex[:6]}"

        session = self.memory_manager.get_or_create_session(session_id)
        session.add_transcript_chunk(transcript_chunk)
        current_transcript = session.transcript_buffer.strip()

        session_ctx = {
            "last_answer": session.previous_answer,
            "answer_version": session.answer_version,
        }
        ctrl_start = time.time()
        ctrl_result = self.controller.evaluate(current_transcript, session_context=session_ctx)
        controller_latency_ms = round((time.time() - ctrl_start) * 1000, 2)

        prepared = PreparedTurn(
            session=session,
            session_id=session_id,
            turn_id=turn_id,
            transcript_chunk=transcript_chunk,
            current_transcript=current_transcript,
            ctrl_result=ctrl_result,
            turn_start=turn_start,
            controller_latency_ms=controller_latency_ms,
        )

        if ctrl_result.decision != ControllerDecisionEnum.RETRIEVE:
            return prepared

        is_delta = session.is_late_detail(current_transcript)
        prepared.is_delta = is_delta
        prepared.is_provisional = (not is_delta) and _utterance_is_provisional(current_transcript)

        if is_delta:
            prepared.refined_query = session.build_delta_query(current_transcript)
            prepared.delta_seed = session.new_intent_text(current_transcript)
            if session.last_was_provisional and not prepared.delta_seed:
                prepared.delta_seed = current_transcript
        else:
            prepared.refined_query = session.get_refined_query(current_transcript)
            prepared.delta_seed = prepared.refined_query

        prepared.retrieval_mode = (
            "delta" if is_delta else ("provisional" if prepared.is_provisional else "full")
        )

        decomp_start = time.time()
        subqueries_objs = self.decomposer.decompose(prepared.delta_seed)
        prepared.decomposition_latency_ms = round((time.time() - decomp_start) * 1000, 2)
        prepared.subquery_objs = subqueries_objs
        subquery_texts = [sq.query for sq in subqueries_objs]

        if is_delta and session.previous_subqueries:
            combined = list(session.previous_subqueries)
            for sq in subquery_texts:
                if sq not in combined:
                    combined.append(sq)
            prepared.displayed_subqueries = combined
        else:
            prepared.displayed_subqueries = subquery_texts

        return prepared

    # ---------------------------------------------------------------- execute
    def process_turn(self, session_id: str, transcript_chunk: str) -> TurnResult:
        prepared = self._prepare_turn(session_id, transcript_chunk)
        return self._execute_prepared(prepared)

    def _execute_prepared(self, prepared: PreparedTurn) -> TurnResult:
        decision = prepared.ctrl_result.decision
        if decision == ControllerDecisionEnum.WAIT:
            return self._finish_wait(prepared)
        if decision == ControllerDecisionEnum.SUPPRESS:
            return self._finish_suppress(prepared)
        return self._finish_retrieve(prepared)

    # ------------------------------------------------------------------- wait
    def _finish_wait(self, p: PreparedTurn) -> TurnResult:
        event = TelemetryEvent(
            session_id=p.session_id,
            turn_id=p.turn_id,
            pipeline_stage="controller_wait",
            transcript_chunk=p.transcript_chunk,
            controller_decision="WAIT",
            controller_latency_ms=p.controller_latency_ms,
            intent_stability=p.ctrl_result.intent_stability,
            retrieval_mode="wait",
            synthesis_mode="wait_incomplete",
            uncertainty=p.ctrl_result.reason,
            answer_version=p.session.answer_version,
        )
        event.total_latency_ms = round((time.time() - p.turn_start) * 1000, 2)
        telemetry_data = self.telemetry_logger.log_turn_event(event)
        return TurnResult(
            session_id=p.session_id,
            turn_id=p.turn_id,
            decision="WAIT",
            reason=p.ctrl_result.reason,
            query=p.current_transcript,
            answer="[Waiting for complete query statement...]",
            answer_version=p.session.answer_version,
            synthesis_mode="wait_incomplete",
            retrieval_mode="wait",
            retrieval_required=False,
            token_usage={"mode": "none", "tokens_in_estimate": 0, "tokens_out_estimate": 0, "estimated_cost_usd": 0.0},
            telemetry=telemetry_data,
        )

    # --------------------------------------------------------------- suppress
    @staticmethod
    def _transform_presentation(text: str, transcript: str) -> str:
        lower = transcript.lower()
        body = (text or "").strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\[[^\]]+\]", "", body)) if s.strip()]

        limit: Optional[int] = None
        m = re.search(r"\b(\d+|one|two|three|four|five)\s+bullets?\b", lower)
        if m:
            token = m.group(1)
            limit = int(token) if token.isdigit() else NUMBER_WORDS.get(token)
        if limit is None:
            m = re.search(r"\b(\d+|one|two|three|four|five)\s+(?:sentences?|points?)\b", lower)
            if m:
                token = m.group(1)
                limit = int(token) if token.isdigit() else NUMBER_WORDS.get(token)

        wants_bullets = "bullet" in lower or bool(re.search(r"\b(points?|list)\b", lower))
        wants_short = bool(re.search(r"\b(short|shorter|brief|concise|simpler|summary|summarize|summarise)\b", lower))
        wants_translate = "translate" in lower

        if wants_translate:
            # No translation model offline: return context unchanged rather than fabricate.
            return body or "Translation requires an LLM provider; the previous answer was preserved unchanged."

        selected = sentences
        if limit:
            selected = sentences[:limit]
        elif wants_short:
            selected = sentences[:2]

        if not selected:
            return body

        if wants_bullets:
            return "\n".join(f"- {s}" for s in selected)
        return " ".join(selected)

    def _finish_suppress(self, p: PreparedTurn) -> TurnResult:
        session = p.session
        prior_answer = session.previous_answer or "No prior answer exists in this session to restructure."
        transformed = self._transform_presentation(prior_answer, p.transcript_chunk)

        citations = [
            Citation(**c) if isinstance(c, dict) else c
            for c in session.previous_citations
        ]
        evidence: List[RetrievedChunk] = []
        for c in session.previous_evidence:
            if isinstance(c, dict):
                try:
                    evidence.append(RetrievedChunk(**c))
                except Exception:
                    continue

        event = TelemetryEvent(
            session_id=p.session_id,
            turn_id=p.turn_id,
            pipeline_stage="controller_suppress",
            transcript_chunk=p.transcript_chunk,
            controller_decision="SUPPRESS",
            controller_latency_ms=p.controller_latency_ms,
            retrieval_mode="suppress",
            synthesis_mode="suppress_contextual",
            number_of_final_evidence_chunks=len(evidence),
            citation_count=len(citations),
            answer_version=session.answer_version,
        )
        event.total_latency_ms = round((time.time() - p.turn_start) * 1000, 2)
        telemetry_data = self.telemetry_logger.log_turn_event(event)
        session.transcript_buffer = ""

        return TurnResult(
            session_id=p.session_id,
            turn_id=p.turn_id,
            decision="SUPPRESS",
            reason=p.ctrl_result.reason,
            query=p.current_transcript,
            answer=transformed,
            citations=citations,
            evidence=evidence,
            claims=[
                Claim(**c) if isinstance(c, dict) else c
                for c in session.previous_claims
            ],
            uncertainty_flag=not bool(session.previous_answer),
            uncertainty="" if session.previous_answer else "No prior session answer exists to restructure.",
            answer_version=session.answer_version,
            synthesis_mode="suppress_contextual",
            retrieval_mode="suppress",
            retrieval_required=False,
            token_usage={"mode": "none", "tokens_in_estimate": 0, "tokens_out_estimate": 0, "estimated_cost_usd": 0.0},
            telemetry=telemetry_data,
        )

    # --------------------------------------------------------------- retrieve
    def _finish_retrieve(self, p: PreparedTurn) -> TurnResult:
        session = p.session
        event = TelemetryEvent(
            session_id=p.session_id,
            turn_id=p.turn_id,
            pipeline_stage="turn_processing",
            transcript_chunk=p.transcript_chunk,
            controller_decision="RETRIEVE",
            controller_latency_ms=p.controller_latency_ms,
            intent_stability=p.ctrl_result.intent_stability,
            decomposition_latency_ms=p.decomposition_latency_ms,
            number_of_subqueries=len(p.displayed_subqueries),
            retrieval_mode=p.retrieval_mode,
            is_provisional=p.is_provisional,
            is_delta=p.is_delta,
            answer_version=session.answer_version,
        )

        if not self.retriever.is_ready():
            event.uncertainty_flag = True
            event.uncertainty = "corpus_unavailable"
            event.synthesis_mode = "corpus_unavailable"
            event.total_latency_ms = round((time.time() - p.turn_start) * 1000, 2)
            telemetry_data = self.telemetry_logger.log_turn_event(event)
            return TurnResult(
                session_id=p.session_id,
                turn_id=p.turn_id,
                decision="RETRIEVE",
                reason="Corpus unavailable or not indexed yet.",
                query=p.refined_query,
                subqueries=p.displayed_subqueries,
                answer="Corpus unavailable. Please run ingestion (python -m src.ingestion) and retry.",
                uncertainty_flag=True,
                uncertainty="No corpus index is available.",
                answer_version=session.answer_version,
                synthesis_mode="corpus_unavailable",
                retrieval_mode=p.retrieval_mode,
                is_provisional=p.is_provisional,
                is_delta=p.is_delta,
                token_usage={"mode": "none", "tokens_in_estimate": 0, "tokens_out_estimate": 0, "estimated_cost_usd": 0.0},
                telemetry=telemetry_data,
            )

        subquery_texts = [sq.query for sq in p.subquery_objs]
        ret_start = time.time()

        if p.is_delta:
            new_chunks = self.retriever.search_parallel(
                subquery_texts, top_k=settings.MAX_RETRIEVAL_CHUNKS, rerank=True
            )
            prior = _session_chunks(session)
            merged = HybridRetriever.merge_unique(prior, new_chunks)
            rerank_start = time.time()
            all_retrieved = self.retriever.rerank_candidates(
                p.refined_query, merged, top_k=max(settings.MAX_RETRIEVAL_CHUNKS, len(prior))
            )
            rerank_ms = (time.time() - rerank_start) * 1000
        else:
            all_retrieved = self.retriever.search_parallel(
                subquery_texts, top_k=settings.MAX_RETRIEVAL_CHUNKS, rerank=True
            )
            rerank_ms = 0.0
        retrieval_ms = (time.time() - ret_start) * 1000

        timings = dict(getattr(self.retriever, "last_timings", {}) or {})
        query_events = list(getattr(self.retriever, "last_query_events", []) or [])

        trigger = (
            "provisional" if p.is_provisional
            else "delta" if p.is_delta
            else ("multi_intent" if len(subquery_texts) > 1 else "full")
        )
        elapsed_base = ret_start - p.turn_start
        retrieval_events: List[Dict[str, Any]] = []
        for idx, qe in enumerate(query_events):
            retrieval_events.append({
                "timestamp_s": round(elapsed_base + (idx * 0.001), 3),
                "query": qe.get("query", ""),
                "trigger": trigger,
                "dense_ms": qe.get("dense_ms", 0.0),
                "sparse_ms": qe.get("sparse_ms", 0.0),
                "fusion_ms": qe.get("fusion_ms", 0.0),
                "rerank_ms": qe.get("rerank_ms", 0.0),
                "candidates": qe.get("fused_count", 0),
                "results": qe.get("result_count", 0),
            })

        event.dense_retrieval_latency_ms = timings.get("dense_retrieval_latency_ms", 0.0)
        event.sparse_retrieval_latency_ms = timings.get("sparse_retrieval_latency_ms", 0.0)
        event.fusion_latency_ms = timings.get("fusion_latency_ms", 0.0)
        event.reranking_latency_ms = round(timings.get("reranking_latency_ms", 0.0) + rerank_ms, 2)
        event.number_of_retrieved_chunks = len(all_retrieved)
        event.retrieval_events = retrieval_events

        # Evidence refinement + fusion selection.
        if p.is_delta:
            constraint_terms = session.extract_delta_constraints(p.current_transcript)
        else:
            constraint_terms = session.extract_constraint_terms(p.refined_query)

        refined_evidence = _refine_evidence_with_session(all_retrieved, constraint_terms)
        multi_intent = len(p.displayed_subqueries) > 1 or len(subquery_texts) > 1
        if multi_intent:
            final_evidence = self.retriever.select_balanced_evidence(
                refined_evidence, settings.MAX_RETRIEVAL_CHUNKS
            )
        if not multi_intent or not final_evidence:
            final_evidence = refined_evidence[:settings.MAX_RETRIEVAL_CHUNKS]
        event.number_of_final_evidence_chunks = len(final_evidence)

        synth_start = time.time()
        new_version = session.answer_version + 1
        prior_claims = [
            Claim(**c) if isinstance(c, dict) else c
            for c in session.previous_claims
        ]
        delta_terms: List[str] = []
        if p.is_delta:
            delta_terms = session.extract_delta_constraints(p.current_transcript)
            if session.last_was_provisional and not prior_claims:
                # Provisional answer exists; treat its claims as prior context too.
                prior_claims = [
                    Claim(**c) if isinstance(c, dict) else c
                    for c in session.previous_claims
                ]

        grounded_answer: GroundedAnswer = self.synthesizer.synthesize(
            query=p.refined_query,
            evidence=final_evidence,
            session=session,
            answer_version=new_version,
            subqueries=subquery_texts if subquery_texts else p.displayed_subqueries,
            prior_claims=prior_claims if p.is_delta else None,
            prior_answer=session.previous_answer,
            delta_terms=delta_terms,
            delta_mode=p.is_delta and bool(prior_claims),
        )
        synth_latency = (time.time() - synth_start) * 1000

        event.synthesis_latency_ms = round(synth_latency, 2)
        event.ttft_ms = round((time.time() - p.turn_start) * 1000, 2)
        event.citation_count = len(grounded_answer.citations)
        event.uncertainty_flag = grounded_answer.uncertainty_flag
        event.uncertainty = grounded_answer.uncertainty
        event.synthesis_mode = grounded_answer.synthesis_mode
        event.answer_version = new_version
        event.claim_count = len(grounded_answer.claims)
        event.grounded_claim_count = sum(1 for c in grounded_answer.claims if c.grounded)
        event.preserved_claim_count = grounded_answer.preserved_claim_count
        event.updated_claim_count = grounded_answer.updated_claim_count
        event.tokens_in_estimate = grounded_answer.tokens_in_estimate
        event.tokens_out_estimate = grounded_answer.tokens_out_estimate
        event.token_usage = {
            "mode": grounded_answer.synthesis_mode,
            "tokens_in_estimate": grounded_answer.tokens_in_estimate,
            "tokens_out_estimate": grounded_answer.tokens_out_estimate,
            "estimated_cost_usd": self._estimate_cost(
                grounded_answer.tokens_in_estimate, grounded_answer.tokens_out_estimate
            ),
        }
        event.total_latency_ms = round((time.time() - p.turn_start) * 1000, 2)

        evidence_dicts = [c.model_dump() for c in final_evidence]
        session.update_turn_result(
            query=p.refined_query,
            subqueries=p.displayed_subqueries,
            evidence=evidence_dicts,
            answer=grounded_answer.answer_text,
            constraints={"terms": constraint_terms},
            clear_buffer=not p.is_provisional,
            provisional=p.is_provisional,
            claims=[c.model_dump() for c in grounded_answer.claims],
            citations=[c.model_dump() for c in grounded_answer.citations],
        )

        telemetry_data = self.telemetry_logger.log_turn_event(event)

        reason = p.ctrl_result.reason
        if p.is_delta:
            reason = "Late detail arrived; delta retrieval updated affected claims only."
        elif p.is_provisional:
            reason = "Provisional retrieval issued before the utterance fully closed."

        return TurnResult(
            session_id=p.session_id,
            turn_id=p.turn_id,
            decision="RETRIEVE",
            reason=reason,
            query=p.refined_query,
            subqueries=p.displayed_subqueries,
            answer=grounded_answer.answer_text,
            citations=grounded_answer.citations,
            evidence=final_evidence,
            claims=grounded_answer.claims,
            uncertainty_flag=grounded_answer.uncertainty_flag,
            uncertainty=grounded_answer.uncertainty,
            answer_version=new_version,
            synthesis_mode=grounded_answer.synthesis_mode,
            retrieval_mode=p.retrieval_mode,
            retrieval_required=True,
            is_provisional=p.is_provisional,
            is_delta=p.is_delta,
            preserved_claim_count=grounded_answer.preserved_claim_count,
            updated_claim_count=grounded_answer.updated_claim_count,
            retrieval_events=retrieval_events,
            token_usage=event.token_usage,
            telemetry=telemetry_data,
        )

    @staticmethod
    def _estimate_cost(tokens_in: int, tokens_out: int) -> float:
        # Informational estimate using a modest hosted-LLM price point.
        return round((tokens_in * 0.15 + tokens_out * 0.60) / 1_000_000, 6)

    # ---------------------------------------------------------------- stream
    async def process_turn_stream(
        self, session_id: str, transcript_chunk: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        import asyncio

        prepared = self._prepare_turn(session_id, transcript_chunk)

        yield {
            "event": "decision",
            "data": {
                "decision": prepared.ctrl_result.decision.value,
                "reason": prepared.ctrl_result.reason,
                "retrieval_required": prepared.ctrl_result.retrieval_required,
                "trigger": prepared.ctrl_result.trigger,
                "intent_stability": prepared.ctrl_result.intent_stability,
                "query": prepared.current_transcript,
                "retrieval_mode": prepared.retrieval_mode,
                "is_provisional": prepared.is_provisional,
                "is_delta": prepared.is_delta,
            },
        }

        if prepared.ctrl_result.decision == ControllerDecisionEnum.RETRIEVE:
            yield {
                "event": "retrieval_started",
                "data": {
                    "subqueries": prepared.displayed_subqueries,
                    "mode": prepared.retrieval_mode,
                    "trigger": "provisional" if prepared.is_provisional else ("delta" if prepared.is_delta else "full"),
                },
            }

        # Retrieval + synthesis run off the event loop, but only after the
        # decision/retrieval_started events have actually been emitted.
        turn_result = await asyncio.to_thread(self._execute_prepared, prepared)

        if turn_result.decision == "RETRIEVE":
            if turn_result.is_provisional:
                yield {"event": "provisional", "data": {"answer_version": turn_result.answer_version}}
            if turn_result.is_delta:
                yield {"event": "delta_retrieval", "data": {"answer_version": turn_result.answer_version}}
            yield {
                "event": "evidence",
                "data": {
                    "count": len(turn_result.evidence),
                    "retrieval_events": turn_result.retrieval_events,
                    "citations": [c.model_dump() for c in turn_result.citations],
                },
            }
            yield {"event": "claims", "data": {"claims": [c.model_dump() for c in turn_result.claims]}}
            if turn_result.uncertainty_flag:
                yield {"event": "uncertainty", "data": {"message": turn_result.uncertainty}}

        yield {"event": "ttft", "data": {"ttft_ms": turn_result.telemetry.get("ttft_ms", 0.0)}}

        words = turn_result.answer.split(" ")
        for i, word in enumerate(words):
            token_str = word + (" " if i < len(words) - 1 else "")
            yield {"event": "token", "data": {"token": token_str}}

        complete = turn_result.model_dump()
        complete["output_record"] = turn_result.output_record()
        yield {"event": "complete", "data": complete}
