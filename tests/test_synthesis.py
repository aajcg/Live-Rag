import pytest
from src.synthesis import AnswerSynthesizer
from src.retrieval import RetrievedChunk

@pytest.fixture
def synthesizer():
    return AnswerSynthesizer(use_llm=False)

def test_synthesis_empty_evidence(synthesizer):
    ans = synthesizer.synthesize("What is X?", [])
    assert ans.uncertainty_flag is True
    assert "insufficient" in ans.answer_text.lower()
    assert ans.synthesis_mode == "insufficient_evidence"

def test_synthesis_extractive_fallback(synthesizer):
    chunks = [
        RetrievedChunk(
            chunk_id="chk_s1",
            source_file="guide.pdf",
            document_title="guide",
            page_number=4,
            corpus="Aventro Motors",
            chunk_index=0,
            text="The international warranty exceptions include water damage and unauthorized modification.",
            retrieval_score=0.9,
            retrieval_method="hybrid_rrf"
        )
    ]
    ans = synthesizer.synthesize("What are the international warranty exceptions?", chunks)
    assert ans.uncertainty_flag is False
    assert ans.synthesis_mode == "extractive_fallback"
    assert len(ans.citations) == 1
    assert ans.citations[0].chunk_id == "chk_s1"
    assert ans.citations[0].source == "guide.pdf"
    assert ans.citations[0].page == 4
    assert "water damage" in ans.answer_text.lower()
    assert len(ans.claims) >= 1
    assert ans.claims[0].grounded is True
    assert ans.claims[0].chunk_id == "chk_s1"


def test_claim_grounding_flags_unsupported_sentence(synthesizer):
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
            retrieval_method="hybrid_rrf"
        )
    ]
    claims = synthesizer.ground_claims(
        "The battery capacity is 60 kWh. The moon is made of cheese.",
        chunks,
    )
    assert claims[0].grounded is True
    assert claims[1].grounded is False
