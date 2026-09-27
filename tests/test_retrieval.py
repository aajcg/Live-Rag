import pytest
from src.ingestion import DocumentChunk
from src.retrieval import BM25Retriever, ChromaDenseRetriever, HybridRetriever

@pytest.fixture
def mock_chunks():
    return [
        DocumentChunk(
            chunk_id="chk_1",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=1,
            corpus="Aventro Motors",
            chunk_index=0,
            text="The standard warranty period is 24 months covering all hardware defects."
        ),
        DocumentChunk(
            chunk_id="chk_2",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=2,
            corpus="Aventro Motors",
            chunk_index=1,
            text="International claims require proof of purchase and original receipt."
        ),
        DocumentChunk(
            chunk_id="chk_3",
            source_file="shipping_policy.pdf",
            document_title="shipping_policy",
            page_number=1,
            corpus="Aventro Motors",
            chunk_index=0,
            text="Standard shipping takes 3-5 business days across all regions."
        )
    ]

def test_bm25_retriever(mock_chunks):
    bm25 = BM25Retriever()
    bm25.index(mock_chunks)
    assert bm25.is_indexed
    results = bm25.search("warranty period defects", top_k=2)
    assert len(results) > 0
    assert results[0].chunk_id == "chk_1"
    assert results[0].source_file == "warranty_guide.pdf"
    assert results[0].page_number == 1

def test_dense_retriever(mock_chunks):
    dense = ChromaDenseRetriever()
    dense.index(mock_chunks)
    assert dense.is_indexed
    results = dense.search("international shipping delivery", top_k=2)
    assert len(results) > 0
    assert results[0].chunk_id in ["chk_2", "chk_3"]

def test_hybrid_retriever_fusion_and_metadata(mock_chunks):
    retriever = HybridRetriever()
    retriever.chunks = mock_chunks
    retriever.sparse_retriever.index(mock_chunks)
    retriever.dense_retriever.index(mock_chunks)

    assert retriever.is_ready()
    results = retriever.search("warranty coverage and international claims", top_k=2, rerank=True)
    assert len(results) == 2
    for res in results:
        assert res.document_title in ["warranty_guide", "shipping_policy"]
        assert res.chunk_id is not None
        assert res.source_file is not None
        assert res.retrieval_score != 0
        assert res.retrieval_method in ["hybrid_rrf", "reranked_composite", "reranked_cross_encoder"]
