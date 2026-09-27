"""Grounding: real citations only, no fabrication, explicit uncertainty."""
import pytest
from src.synthesis import AnswerSynthesizer
from src.retrieval import RetrievedChunk
from src.controller import STOPWORDS


def _content_words(text):
    import re
    return [w for w in re.findall(r"[A-Za-z0-9%]+", text.lower()) if len(w) > 1 and w not in STOPWORDS]


def test_grounding_flags_unsupported_sentence():
    synthesizer = AnswerSynthesizer(use_llm=False)
    chunks = [
        RetrievedChunk(
            chunk_id="chk_s2",
            source_file="guide.pdf",
            document_title="guide",
            page_number=1,
            corpus="Aventro Motors",
            chunk_index=0,
            text="The battery capacity is 60 kWh.",
            retrieval_score=0.9,
            retrieval_method="hybrid_rrf",
        )
    ]
    claims = synthesizer.ground_claims(
        "The battery capacity is 60 kWh. The moon is made of cheese.",
        chunks,
    )
    assert claims[0].grounded is True
    assert claims[1].grounded is False
    assert claims[1].chunk_id is None


def test_citations_are_traceable_to_real_chunks(corpus_pipeline):
    p = corpus_pipeline
    corpus_ids = {c.chunk_id for c in p.retriever.chunks}
    result = p.process_turn("ground_sess_1", "What does the default warranty cover?")
    assert result.decision == "RETRIEVE"
    assert result.citations
    for citation in result.citations:
        assert citation.chunk_id in corpus_ids, f"fabricated citation {citation.chunk_id}"
        assert citation.label and "\u00a7p" in citation.label
    for claim in result.claims:
        if claim.chunk_id:
            assert claim.chunk_id in corpus_ids


def test_claims_are_supported_by_their_cited_chunk(corpus_pipeline):
    p = corpus_pipeline
    by_id = {c.chunk_id: c for c in p.retriever.chunks}
    result = p.process_turn("ground_sess_2", "What does the default warranty cover?")
    assert result.claims
    for claim in result.claims:
        assert claim.grounded is True
        chunk = by_id[claim.chunk_id]
        claim_words = _content_words(claim.text)
        chunk_words = set(_content_words(chunk.text))
        covered = sum(1 for w in claim_words if w in chunk_words)
        assert covered / max(len(claim_words), 1) >= 0.55


def test_uncertainty_when_corpus_lacks_evidence(corpus_pipeline):
    p = corpus_pipeline
    result = p.process_turn(
        "ground_sess_3",
        "What is the submarine sonar calibration procedure for the Aventro?",
    )
    assert result.decision == "RETRIEVE"
    assert result.uncertainty_flag is True
    assert result.uncertainty
    corpus_ids = {c.chunk_id for c in p.retriever.chunks}
    for citation in result.citations:
        assert citation.chunk_id in corpus_ids
