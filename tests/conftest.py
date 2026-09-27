import os

import pytest

# The default test suite runs fully offline without downloading embedding or
# cross-encoder models. Integration/benchmark runs unset this variable.
os.environ.setdefault("TEST_OFFLINE_FAST", "1")
os.environ.setdefault("STREAM_TOKEN_DELAY_S", "0")

from src.ingestion import DocumentChunk  # noqa: E402
from src.pipeline import RAGPipeline  # noqa: E402


def make_small_corpus():
    return [
        DocumentChunk(
            chunk_id="chk_w1",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=1,
            chunk_index=0,
            text="The default warranty covers manufacturing defects for 12 months from the purchase date.",
        ),
        DocumentChunk(
            chunk_id="chk_w2",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=2,
            chunk_index=1,
            text="International warranty claims require proof of purchase, the original receipt and prior service approval.",
        ),
        DocumentChunk(
            chunk_id="chk_w3",
            source_file="warranty_guide.pdf",
            document_title="warranty_guide",
            page_number=3,
            chunk_index=2,
            text="The warranty is void after unauthorized modification, accidental water damage or missed service intervals.",
        ),
        DocumentChunk(
            chunk_id="chk_s1",
            source_file="service_policy.pdf",
            document_title="service_policy",
            page_number=1,
            chunk_index=0,
            text="Scheduled service intervals are every 10,000 km or 12 months, whichever comes first, at an authorized service center.",
        ),
    ]


def build_pipeline():
    pipeline = RAGPipeline()
    chunks = make_small_corpus()
    pipeline.retriever.chunks = chunks
    pipeline.retriever.sparse_retriever.index(chunks)
    pipeline.retriever.dense_retriever.index(chunks)
    return pipeline


@pytest.fixture
def corpus_pipeline():
    return build_pipeline()
