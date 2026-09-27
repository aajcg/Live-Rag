"""Telemetry: every turn produces a coherent, structured trace."""
import json
import os
import pytest


def test_trace_coverage_is_complete(corpus_pipeline):
    p = corpus_pipeline
    p.process_turn("tele_sess", "I want to know about")          # WAIT
    p.process_turn("tele_sess", "What does the default warranty cover?")  # RETRIEVE
    p.process_turn("tele_sess", "Please repeat your last answer in two bullets.")  # SUPPRESS
    p.process_turn("tele_sess", "International claims need approval")     # DELTA

    coverage = p.telemetry_logger.trace_coverage()
    assert coverage["traces"] == 4
    assert coverage["coverage"] == 1.0


def test_retrieval_events_in_telemetry(corpus_pipeline):
    p = corpus_pipeline
    result = p.process_turn("tele_sess_2", "What does the default warranty cover? and service interval?")
    telemetry = result.telemetry
    assert telemetry["number_of_subqueries"] >= 2
    assert telemetry["retrieval_events"]
    for event in telemetry["retrieval_events"]:
        assert event["query"]
        assert "dense_ms" in event and "sparse_ms" in event
    assert telemetry["token_usage"]["tokens_in_estimate"] > 0
    assert telemetry["answer_version_lineage"] == [result.answer_version]


def test_answer_version_lineage_grows(corpus_pipeline):
    p = corpus_pipeline
    p.process_turn("tele_sess_3", "What does the default warranty cover?")
    r2 = p.process_turn("tele_sess_3", "What about international claims?")
    assert r2.telemetry["answer_version_lineage"] == [1, 2]


def test_telemetry_jsonl_is_written(corpus_pipeline):
    p = corpus_pipeline
    p.process_turn("tele_sess_4", "What does the default warranty cover?")
    log_path = p.telemetry_logger.log_file
    assert log_path.exists()
    last_line = [line for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()][-1]
    payload = json.loads(last_line)
    assert payload["pipeline_stage"] == "turn_processing"
