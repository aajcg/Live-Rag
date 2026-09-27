"""Scripted end-to-end demonstration of the Streaming Live RAG engine.

Shows, in order: incremental transcript arrival -> controller decisions ->
early/provisional retrieval -> multi-intent decomposition -> hybrid retrieval
-> synthesis with citations -> late-detail delta retrieval -> answer version 2
-> presentation-only suppression -> telemetry.

Usage: python run.py demo [--fast]
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def banner(title: str):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def show_turn(arrival_s: float, chunk: str, result, show_events: bool = True):
    print(f"[{arrival_s:5.2f}s] transcript chunk : {chunk!r}")
    trigger = result.retrieval_mode
    print(f"          controller      : {result.decision}  ({result.reason})")
    print(
        f"          retrieval        : mode={trigger} required={result.retrieval_required} "
        f"provisional={result.is_provisional} delta={result.is_delta} version={result.answer_version}"
    )
    if result.subqueries:
        print(f"          subqueries       : {result.subqueries}")
    if show_events and result.retrieval_events:
        for event in result.retrieval_events:
            print(
                f"          retrieval event  : t+{event['timestamp_s']:.3f}s "
                f"trigger={event['trigger']} query={event['query']!r} "
                f"dense={event['dense_ms']}ms sparse={event['sparse_ms']}ms "
                f"rerank={event['rerank_ms']}ms"
            )
    if result.evidence:
        for ev in result.evidence[:3]:
            print(f"          evidence         : [{ev.source_file}, p.{ev.page_number}] score={ev.retrieval_score:.4f}")
    if result.decision in ("RETRIEVE", "SUPPRESS"):
        print(f"          answer v{result.answer_version:<2}      : {result.answer[:220]}")
    if result.citations:
        labels = [c.label for c in result.citations]
        print(f"          citations        : {labels}")
    if result.uncertainty_flag:
        print(f"          uncertainty      : {result.uncertainty or '(flagged)'}")
    if result.preserved_claim_count or result.updated_claim_count:
        print(
            f"          delta engine     : preserved_claims={result.preserved_claim_count} "
            f"updated_claims={result.updated_claim_count}"
        )
    print()


def run_demo(fast: bool = False) -> int:
    if fast:
        print("(offline-fast mode: lexical dense fallback + composite reranker)")

    banner("WARM-UP: loading corpus and models")
    t0 = time.time()
    from src.pipeline import RAGPipeline
    pipeline = RAGPipeline()
    print(f"corpus chunks indexed : {len(pipeline.retriever.chunks)}")
    print(f"pipeline ready        : {pipeline.retriever.is_ready()}")
    if not fast:
        print("warming embedding + reranker models (first run may download model weights)...")
        pipeline.retriever.warm_up()
    print(f"warm-up completed in {time.time() - t0:.1f}s")

    # ------------------------------------------------------------ scenario 1
    banner("SCENARIO 1 - Incremental multi-intent transcript (early retrieval)")
    session = "demo_live_stream"
    chunks = [
        (0.0, "I need to know how to change a..."),
        (0.8, "...tyre on my Aventro car, and..."),
        (1.6, "...how to open the boot and what the warning alerts mean."),
    ]
    last = None
    for arrival, chunk in chunks:
        last = pipeline.process_turn(session, chunk)
        show_turn(arrival, chunk, last)

    print("FINAL STREAM RESPONSE (v%d):" % last.answer_version)
    print(last.answer)
    print()
    print("Structured output event record:")
    print(json.dumps(last.output_record(), indent=2)[:1800])

    # ------------------------------------------------------------ scenario 2
    banner("SCENARIO 2 - Late-arriving detail (refine, do not restart)")
    session2 = "demo_late_detail"
    initial = pipeline.process_turn(session2, "What is the procedure to sell my Aventro car?")
    show_turn(0.0, "What is the procedure to sell my Aventro car?", initial)
    late = pipeline.process_turn(
        session2,
        "Actually the car is a pre-owned certified vehicle and the paperwork was done after the warranty ended.",
    )
    show_turn(2.0, "Actually the car is a pre-owned certified vehicle ...", late)
    print("ANSWER VERSION EVOLUTION")
    print(f"  v{initial.answer_version}: {initial.answer[:200]}")
    print(f"  v{late.answer_version}: {late.answer[:200]}")
    print(f"  telemetry lineage: {late.telemetry.get('answer_version_lineage')}")

    # ------------------------------------------------------------ scenario 3
    banner("SCENARIO 3 - Presentation-only suppression (no retrieval, no fabrication)")
    suppress = pipeline.process_turn(session2, "Please repeat your last answer in two bullets.")
    show_turn(3.0, "Please repeat your last answer in two bullets.", suppress)
    print(f"retrieval events executed: {len(suppress.retrieval_events)} (expected 0)")
    print(f"answer version unchanged  : {suppress.answer_version == late.answer_version}")

    # ------------------------------------------------------------ telemetry
    banner("TELEMETRY SUMMARY")
    coverage = pipeline.telemetry_logger.trace_coverage()
    print(f"traces captured : {coverage['traces']}")
    print(f"trace coverage  : {coverage['coverage']:.1%}")
    print(f"telemetry log   : {pipeline.telemetry_logger.log_file}")
    print()
    print("Last turn telemetry:")
    for key in (
        "controller_decision", "retrieval_mode", "number_of_subqueries",
        "dense_retrieval_latency_ms", "sparse_retrieval_latency_ms",
        "fusion_latency_ms", "reranking_latency_ms", "synthesis_latency_ms",
        "total_latency_ms", "answer_version", "token_usage",
    ):
        print(f"  {key:32}: {last.telemetry.get(key)}")
    print()
    print("Demo complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(run_demo("--fast" in sys.argv))
