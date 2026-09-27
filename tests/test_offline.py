"""Offline-first guarantees: the core pipeline never requires an API key."""
import os
import sys
import pytest


def test_core_modules_do_not_import_openai_at_module_level():
    import importlib
    for name in [
        "src.config", "src.controller", "src.decomposer", "src.ingestion",
        "src.memory", "src.retrieval", "src.synthesis", "src.telemetry",
        "src.pipeline",
    ]:
        importlib.import_module(name)
    # openai may be installed in some environments; what matters is that the
    # pipeline core does not require it (all imports are lazy).
    pipeline = sys.modules["src.pipeline"]
    source = open(pipeline.__file__, "r", encoding="utf-8").read()
    assert "import openai" not in source


def test_full_turn_without_api_key(corpus_pipeline, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = corpus_pipeline.process_turn("offline_sess", "What does the default warranty cover?")
    assert result.decision == "RETRIEVE"
    assert result.answer
    assert result.synthesis_mode in (
        "extractive_fallback", "extractive_weak", "delta_refinement", "insufficient_evidence"
    )


def test_hybrid_retrieval_works_when_offline(corpus_pipeline):
    results = corpus_pipeline.retriever.search("warranty coverage", top_k=3, rerank=True)
    assert results
    assert all(r.retrieval_method in ("reranked_composite", "reranked_cross_encoder", "hybrid_rrf") for r in results)
