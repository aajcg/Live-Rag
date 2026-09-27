"""End-to-end streaming behavior: early retrieval, incremental refinement."""
import pytest


def test_incremental_stream_waits_then_retrieves_provisionally(corpus_pipeline):
    p = corpus_pipeline
    session = "stream_sess_1"

    chunk1 = "I need to plan a customer workshop in..."
    r1 = p.process_turn(session, chunk1)
    assert r1.decision == "WAIT"
    assert r1.retrieval_required is False
    assert r1.evidence == []

    chunk2 = "...Pune for 30 people, and I need..."
    r2 = p.process_turn(session, chunk2)
    assert r2.decision == "RETRIEVE"
    assert r2.is_provisional is True
    assert r2.retrieval_mode == "provisional"
    assert r2.retrieval_required is True
    assert len(r2.retrieval_events) >= 1
    assert r2.answer_version == 1

    chunk3 = "...the cancellation policy and the catering options."
    r3 = p.process_turn(session, chunk3)
    assert r3.decision == "RETRIEVE"
    # The final chunk completes the utterance: delta/continuation retrieval.
    assert r3.retrieval_mode in ("delta", "full")
    assert r3.answer_version >= 2
    assert len(r3.subqueries) >= 2


def test_retrieval_begins_before_final_transcript_chunk(corpus_pipeline):
    p = corpus_pipeline
    session = "stream_sess_early"
    chunks = [
        "I want to know the service...",
        "...interval for the Aventro...",
        "...and the warranty conditions.",
    ]
    retrieval_chunk_index = None
    for idx, chunk in enumerate(chunks):
        result = p.process_turn(session, chunk)
        if result.decision == "RETRIEVE" and retrieval_chunk_index is None:
            retrieval_chunk_index = idx
    assert retrieval_chunk_index is not None
    assert retrieval_chunk_index < len(chunks) - 1


def test_retrieval_events_carry_timestamps_and_triggers(corpus_pipeline):
    p = corpus_pipeline
    result = p.process_turn("stream_events", "What is the default warranty coverage?")
    assert result.decision == "RETRIEVE"
    assert result.retrieval_events
    for event in result.retrieval_events:
        assert "timestamp_s" in event
        assert event["query"]
        assert event["trigger"] in ("full", "provisional", "multi_intent", "delta")
        assert event["dense_ms"] >= 0
        assert event["sparse_ms"] >= 0

    record = result.output_record()
    assert set(record.keys()) == {"retrieval_events", "sub_queries", "answer", "citations", "uncertainty"}
