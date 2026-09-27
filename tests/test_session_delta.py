"""Session refinement: late constraints refine existing state, sessions stay isolated."""
import pytest


def test_statement_style_late_detail_triggers_delta(corpus_pipeline):
    p = corpus_pipeline
    session = "delta_sess_1"

    first = p.process_turn(session, "What does the default warranty cover?")
    assert first.decision == "RETRIEVE"
    assert first.answer_version == 1
    assert first.claims

    late = p.process_turn(
        session,
        "The vehicle is used internationally and the repair was done after the warranty ended.",
    )
    assert late.decision == "RETRIEVE"
    assert late.is_delta is True
    assert late.retrieval_mode == "delta"
    assert late.answer_version == 2
    assert late.retrieval_events
    assert all(e["trigger"] == "delta" for e in late.retrieval_events)
    # Session context is not restarted: prior evidence is still available.
    assert len(late.evidence) >= 1


def test_late_detail_preserves_prior_claims_and_adds_new(corpus_pipeline):
    p = corpus_pipeline
    session = "delta_sess_2"

    first = p.process_turn(session, "What does the default warranty cover?")
    prior_claim_texts = {c.text for c in first.claims}

    late = p.process_turn(session, "International claims need approval")
    assert late.is_delta is True
    all_claim_texts = {c.text for c in late.claims}
    # At least one unaffected prior claim is preserved across versions.
    assert all_claim_texts & prior_claim_texts or late.preserved_claim_count > 0
    assert late.answer_version == first.answer_version + 1


def test_sessions_are_strictly_isolated(corpus_pipeline):
    p = corpus_pipeline
    p.process_turn("iso_a", "What does the default warranty cover?")
    p.process_turn("iso_b", "What is the service interval?")

    late = p.process_turn("iso_a", "The vehicle is used internationally and the repair was done after the warranty ended.")
    assert late.is_delta is True

    session_b = p.memory_manager.get_session("iso_b")
    assert session_b is not None
    assert "international" not in (session_b.previous_query or "").lower()
    assert session_b.answer_version == 1

    session_a = p.memory_manager.get_session("iso_a")
    assert session_a.answer_version == 2


def test_wait_turns_do_not_increment_answer_version(corpus_pipeline):
    p = corpus_pipeline
    session = "delta_sess_3"
    r1 = p.process_turn(session, "What does the default warranty cover?")
    r2 = p.process_turn(session, "and then")
    assert r2.decision == "WAIT"
    assert r2.answer_version == r1.answer_version
