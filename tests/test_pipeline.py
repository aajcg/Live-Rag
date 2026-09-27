import pytest
from unittest.mock import MagicMock
from src.pipeline import RAGPipeline
from src.retrieval import HybridRetriever, RetrievedChunk
from src.ingestion import DocumentChunk

@pytest.fixture
def test_pipeline():
    pipeline = RAGPipeline()
    chunks = [
        DocumentChunk(
            chunk_id="chk_test_1",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=1,
            corpus="Aventro Motors",
            chunk_index=0,
            text="The default warranty covers manufacturing defects for 12 months."
        )
    ]
    pipeline.retriever.chunks = chunks
    pipeline.retriever.sparse_retriever.index(chunks)
    pipeline.retriever.dense_retriever.index(chunks)
    return pipeline

def test_pipeline_wait_path(test_pipeline):
    result = test_pipeline.process_turn("sess_1", "I want to ask about")
    assert result.decision == "WAIT"
    assert len(result.evidence) == 0
    assert result.telemetry.get("controller_decision") == "WAIT"

def test_pipeline_suppress_path(test_pipeline):
    test_pipeline.process_turn("sess_2", "What is covered by warranty?")
    result = test_pipeline.process_turn("sess_2", "Format as bullet points")
    assert result.decision == "SUPPRESS"

def test_pipeline_retrieve_path(test_pipeline):
    result = test_pipeline.process_turn("sess_3", "What is covered by the default warranty?")
    assert result.decision == "RETRIEVE"
    assert len(result.subqueries) >= 1
    assert len(result.evidence) > 0
    assert result.answer_version == 1

def test_session_refinement(test_pipeline):
    res1 = test_pipeline.process_turn("sess_refine", "What events are covered?")
    res2 = test_pipeline.process_turn("sess_refine", "Only international events")
    assert res2.decision in ["RETRIEVE", "SUPPRESS"]
    assert res2.answer_version >= 1

def test_provisional_then_delta_late_detail(test_pipeline):
    first = test_pipeline.process_turn("sess_live", "What is covered by the default warranty")
    assert first.decision == "RETRIEVE"
    assert first.is_provisional is True
    assert first.answer_version == 1
    assert first.retrieval_mode == "provisional"
    assert len(first.claims) >= 1

    second = test_pipeline.process_turn("sess_live", "only international exceptions")
    assert second.decision == "RETRIEVE"
    assert second.is_delta is True
    assert second.answer_version == 2
    assert second.retrieval_mode == "delta"


def test_parallel_multi_intent_retrieval(test_pipeline):
    mock_chunk = RetrievedChunk(
        chunk_id="chk_mock_multi",
        source_file="mock.pdf",
        document_title="mock",
        page_number=1,
        corpus="Aventro Motors",
        chunk_index=0,
        text="Mock evidence text covering period and coverage.",
        retrieval_score=0.95,
        retrieval_method="mock",
        metadata={"matched_queries": []},
    )
    timing = {
        "query": "", "dense_ms": 0.0, "sparse_ms": 0.0, "fusion_ms": 0.0,
        "rerank_ms": 0.0, "dense_count": 1, "sparse_count": 1,
        "fused_count": 1, "result_count": 1,
    }

    calls = []

    def fake_search_once(query, top_k=None, rerank=True):
        calls.append(query)
        chunk = mock_chunk.model_copy(deep=True)
        chunk.metadata = {"matched_queries": [query]}
        event = dict(timing, query=query)
        return [chunk], event

    original = test_pipeline.retriever._search_once
    test_pipeline.retriever._search_once = fake_search_once
    try:
        result = test_pipeline.process_turn(
            "sess_multi",
            "What is the warranty period and what does it cover?",
        )
    finally:
        test_pipeline.retriever._search_once = original

    assert result.decision == "RETRIEVE"
    assert len(result.subqueries) >= 2
    # Exactly one retrieval execution per decomposed intent: no duplication.
    assert len(calls) == len(result.subqueries)


def test_single_retrieval_execution_per_turn(test_pipeline):
    """
    CRITICAL REQUIREMENT: Proves that a single RETRIEVE turn triggers
    search on the retriever exactly per decomposed subqueries, without
    duplicate or repeated retrieval calls.
    """
    mock_search = MagicMock(return_value=[
        RetrievedChunk(
            chunk_id="chk_mock",
            source_file="mock.pdf",
            document_title="mock",
            page_number=1,
            corpus="Aventro Motors",
            chunk_index=0,
            text="Mock evidence text.",
            retrieval_score=0.95,
            retrieval_method="mock"
        )
    ])
    test_pipeline.retriever.search = mock_search

    result = test_pipeline.process_turn("sess_single_ret", "Does Aventro Zoom have cruise control?")
    assert result.decision == "RETRIEVE"
    # Search should be called exactly once per decomposed subquery (1 call for single intent)
    assert mock_search.call_count == len(result.subqueries)
    assert mock_search.call_count == 1
