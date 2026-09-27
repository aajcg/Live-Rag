"""Query suppression: presentation-only turns must not trigger retrieval."""
import pytest


def _bomb(*args, **kwargs):
    raise AssertionError("retrieval must not execute for suppression turns")


def test_spec_suppression_example_no_retrieval(corpus_pipeline):
    p = corpus_pipeline
    session = "suppress_sess_1"

    first = p.process_turn(session, "What is covered by the default warranty?")
    assert first.decision == "RETRIEVE"
    assert first.citations

    p.retriever.search = _bomb
    p.retriever._search_once = _bomb
    p.retriever.search_parallel = _bomb

    result = p.process_turn(session, "Please repeat your last answer in two bullets.")
    assert result.decision == "SUPPRESS"
    assert result.retrieval_required is False
    assert result.reason == "presentation_restructure"
    assert result.retrieval_events == []
    # Only the previously retrieved session evidence is reused; no new search ran.
    assert [e.chunk_id for e in result.evidence] == [e.chunk_id for e in first.evidence]
    assert result.answer_version == first.answer_version
    assert "\n- " in result.answer
    # Prior citations are retained without fabricating new ones.
    assert [c.chunk_id for c in result.citations] == [c.chunk_id for c in first.citations]


def test_shorten_request_is_suppressed(corpus_pipeline):
    p = corpus_pipeline
    session = "suppress_sess_2"
    p.process_turn(session, "What does the warranty cover?")
    result = p.process_turn(session, "Make it shorter")
    assert result.decision == "SUPPRESS"
    assert result.retrieval_required is False


def test_new_factual_question_with_style_word_is_not_suppressed(corpus_pipeline):
    p = corpus_pipeline
    result = p.process_turn("suppress_sess_3", "Summarize the warranty coverage rules for the Aventro model")
    assert result.decision == "RETRIEVE"
    assert result.retrieval_required is True
