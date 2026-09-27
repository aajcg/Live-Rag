"""Retrieval legs: BM25, RRF fusion, dedupe, parallel timing honesty."""
import pytest
from src.ingestion import DocumentChunk
from src.retrieval import BM25Retriever, ChromaDenseRetriever, HybridRetriever, RetrievedChunk


def _chunk(cid, text, score=0.5, source="corpus.pdf", page=1):
    return RetrievedChunk(
        chunk_id=cid,
        source_file=source,
        document_title=source.replace(".pdf", ""),
        page_number=page,
        corpus="Aventro Motors",
        chunk_index=0,
        text=text,
        retrieval_score=score,
        retrieval_method="test",
        metadata={},
    )


def test_pure_python_bm25_scores():
    retriever = BM25Retriever()
    chunks = [
        DocumentChunk(chunk_id="c1", source_file="a.pdf", document_title="a", page_number=1, chunk_index=0,
                      text="tyre replacement jack wheel nuts torque"),
        DocumentChunk(chunk_id="c2", source_file="b.pdf", document_title="b", page_number=1, chunk_index=0,
                      text="warranty coverage manufacturing defects"),
    ]
    retriever.index(chunks)
    retriever.bm25 = None  # force pure Python BM25 path
    results = retriever.search("tyre replacement", top_k=2)
    assert results
    assert results[0].chunk_id == "c1"
    assert results[0].retrieval_score > 0
    assert results[0].retrieval_method == "sparse_bm25"


def test_rrf_fusion_merges_both_rankings():
    retriever = HybridRetriever.__new__(HybridRetriever)
    dense = [_chunk("c1", "a"), _chunk("c2", "b")]
    sparse = [_chunk("c2", "b"), _chunk("c3", "c")]
    fused = retriever._reciprocal_rank_fusion(dense, sparse, k=60, top_k=10)
    ids = [c.chunk_id for c in fused]
    assert set(ids) == {"c1", "c2", "c3"}
    assert fused[0].chunk_id == "c2"
    assert all(c.retrieval_method == "hybrid_rrf" for c in fused)


def test_merge_unique_deduplicates_by_chunk_id():
    a = [_chunk("c1", "old", score=0.1), _chunk("c2", "x", score=0.4)]
    b = [_chunk("c1", "new", score=0.9)]
    merged = HybridRetriever.merge_unique(a, b)
    assert len(merged) == 2
    by_id = {c.chunk_id: c for c in merged}
    assert by_id["c1"].retrieval_score == 0.9


def test_balanced_evidence_selection_keeps_each_intent():
    retriever = HybridRetriever.__new__(HybridRetriever)
    c1 = _chunk("c1", "a", score=0.9)
    c1.metadata["matched_queries"] = ["intent one"]
    c2 = _chunk("c2", "b", score=0.8)
    c2.metadata["matched_queries"] = ["intent two"]
    c3 = _chunk("c3", "c", score=0.7)
    c3.metadata["matched_queries"] = ["intent one"]
    c4 = _chunk("c4", "d", score=0.6)
    c4.metadata["matched_queries"] = ["intent two"]
    selected = retriever.select_balanced_evidence([c1, c2, c3, c4], max_total=3)
    ids = [c.chunk_id for c in selected]
    assert "c1" in ids and "c2" in ids
    assert len(ids) == 3


def test_parallel_search_events_are_real():
    retriever = HybridRetriever()
    chunks = [
        DocumentChunk(chunk_id="p1", source_file="a.pdf", document_title="a", page_number=1, chunk_index=0,
                      text="warranty coverage for manufacturing defects"),
        DocumentChunk(chunk_id="p2", source_file="b.pdf", document_title="b", page_number=1, chunk_index=0,
                      text="service interval every 10000 km"),
    ]
    retriever.chunks = chunks
    retriever.sparse_retriever.index(chunks)
    retriever.dense_retriever.index(chunks)

    results = retriever.search_parallel(
        ["warranty coverage", "service interval"], top_k=2, rerank=True
    )
    assert retriever.last_query_events
    queries = {e["query"] for e in retriever.last_query_events}
    assert queries == {"warranty coverage", "service interval"}
    for event in retriever.last_query_events:
        assert event["dense_ms"] >= 0
        assert event["sparse_ms"] >= 0
    assert results
