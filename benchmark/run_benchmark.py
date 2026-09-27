"""Automated benchmark harness for Samsung Theme 4 evaluation gates G2-G6.

Run with:
    python run.py benchmark
or
    python benchmark/run_benchmark.py

The harness drives the *real* pipeline (real corpus, dense + BM25 + RRF +
cross-encoder rerank) and measures observable behavior. It contains only
behavioral expectations; no answers are precomputed into the system.
"""
import json
import os
import platform
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _prepare_environment():
    # Honest measurement: real embeddings + cross-encoder reranker.
    os.environ.pop("TEST_OFFLINE_FAST", None)


_prepare_environment()

from src.config import settings  # noqa: E402
from src.controller import STOPWORDS  # noqa: E402

from benchmark.cases import (  # noqa: E402
    STREAM_CASES,
    COMPOUND_CASES,
    GROUNDING_CASES,
    SUPPRESSION_CASES,
    LATE_DETAIL_CASES,
)

CLAIM_SUPPORT_THRESHOLD = 0.55


def content_words(text: str) -> List[str]:
    return [
        w for w in re.findall(r"[A-Za-z0-9%]+", (text or "").lower())
        if len(w) > 1 and w not in STOPWORDS
    ]


def source_matches(expected: str, evidence) -> bool:
    needle = expected.lower()
    for chunk in evidence:
        hay = f"{chunk.source_file} {chunk.document_title}".lower()
        if needle in hay:
            return True
    return False


class BenchmarkRunner:
    def __init__(self):
        from src.pipeline import RAGPipeline
        self.pipeline = RAGPipeline()
        self.corpus = self.pipeline.retriever.chunks
        self.corpus_by_id = {c.chunk_id: c for c in self.corpus}
        self.corpus_sources = {c.source_file for c in self.corpus}
        self.results: Dict[str, Any] = {
            "cases": {},
            "claims": {"total": 0, "supported": 0, "ungrounded": 0, "fabricated": 0},
            "fabricated_citations": 0,
        }

    # ----------------------------------------------------------- verification
    def verify_turn(self, turn) -> Dict[str, Any]:
        """Independent claim/citation verification against the corpus."""
        total = supported = ungrounded = fabricated = 0
        for claim in turn.claims:
            total += 1
            if not claim.chunk_id:
                ungrounded += 1
                continue
            chunk = self.corpus_by_id.get(claim.chunk_id)
            if chunk is None:
                fabricated += 1
                continue
            cw = content_words(claim.text)
            chunk_words = set(content_words(chunk.text))
            coverage = sum(1 for w in cw if w in chunk_words) / max(len(cw), 1)
            if coverage >= CLAIM_SUPPORT_THRESHOLD:
                supported += 1

        fabricated_citations = 0
        for citation in turn.citations:
            if citation.chunk_id not in self.corpus_by_id:
                fabricated_citations += 1

        # Inline citation sources referenced inside the answer text.
        inline_sources = re.findall(r"\[([^\[\]]+?), p\.\d+\]", turn.answer)
        bad_inline = [
            s for s in inline_sources
            if s.strip() not in self.corpus_sources and not s.strip().endswith(".pdf")
        ]
        bad_inline = [s for s in inline_sources if s.strip() not in self.corpus_sources]

        return {
            "claims_total": total,
            "claims_supported": supported,
            "claims_ungrounded": ungrounded,
            "claims_fabricated": fabricated,
            "citations_total": len(turn.citations),
            "fabricated_citations": fabricated_citations,
            "inline_citation_sources": len(inline_sources),
            "inline_citation_sources_invalid": bad_inline,
        }

    # ------------------------------------------------------------------ G2
    def run_g2(self) -> Dict[str, Any]:
        eligible = early = 0
        wait_chunks = false_triggers = 0
        decision_correct = decision_total = 0
        case_details = []
        for case in STREAM_CASES:
            session = f"{case['session_id']}_{int(time.time() * 1000) % 100000}"
            decisions = []
            first_retrieve_idx: Optional[int] = None
            last_turn = None
            for idx, chunk in enumerate(case["chunks"]):
                turn = self.pipeline.process_turn(session, chunk)
                decisions.append(turn.decision)
                if turn.decision == "RETRIEVE" and first_retrieve_idx is None:
                    first_retrieve_idx = idx
                last_turn = turn
                self._accumulate_claims(turn)

            expected = case["expect"]["decisions"]
            for actual, want in zip(decisions, expected):
                decision_total += 1
                if actual == want:
                    decision_correct += 1
            for actual, want in zip(decisions, expected):
                if want == "WAIT":
                    wait_chunks += 1
                    if actual == "RETRIEVE":
                        false_triggers += 1

            is_early = first_retrieve_idx is not None and first_retrieve_idx < len(case["chunks"]) - 1
            if case.get("eligible_early_retrieval"):
                eligible += 1
                if is_early:
                    early += 1
            case_details.append({
                "case": case["id"],
                "chunks": len(case["chunks"]),
                "decisions": decisions,
                "expected_decisions": expected,
                "first_retrieve_chunk_index": first_retrieve_idx,
                "early_retrieval": is_early,
                "final_subqueries": last_turn.subqueries if last_turn else [],
                "uncertainty": last_turn.uncertainty if last_turn else "",
            })
            self.results["cases"][case["id"]] = {
                "gate": "G2/G3",
                "decisions": decisions,
                "first_retrieve_chunk_index": first_retrieve_idx,
                "early_retrieval": is_early,
                "final_subqueries": last_turn.subqueries if last_turn else [],
            }

        early_rate = early / eligible if eligible else 0.0
        false_trigger_rate = false_triggers / wait_chunks if wait_chunks else 0.0
        return {
            "eligible_cases": eligible,
            "early_retrieval_cases": early,
            "early_retrieval_rate": round(early_rate, 4),
            "target": 0.80,
            "pass": early_rate >= 0.80,
            "controller_decision_accuracy": round(decision_correct / decision_total, 4) if decision_total else 0.0,
            "false_trigger_rate_on_unstable_fragments": round(false_trigger_rate, 4),
            "cases": case_details,
        }

    # ------------------------------------------------------------------ G3
    def run_g3(self) -> Dict[str, Any]:
        passed = 0
        details = []
        for case in COMPOUND_CASES:
            session = f"{case['session_id']}_{int(time.time() * 1000) % 100000}"
            turn = self.pipeline.process_turn(session, case["query"])
            self._accumulate_claims(turn)
            subs = turn.subqueries
            distinct = self._distinct_subqueries(subs)
            min_required = case["expect"]["min_subqueries"]
            ok = len(distinct) >= min_required and len(distinct) == len(subs)
            passed += int(ok)
            details.append({
                "case": case["id"],
                "subqueries": subs,
                "distinct_subqueries": len(distinct),
                "min_required": min_required,
                "no_near_duplicates": len(distinct) == len(subs),
                "pass": ok,
            })
            self.results["cases"][case["id"]] = {
                "gate": "G3",
                "subqueries": subs,
                "distinct_subqueries": len(distinct),
                "pass": ok,
            }
        total = len(COMPOUND_CASES)
        accuracy = passed / total if total else 0.0
        return {
            "compound_cases": total,
            "correctly_decomposed": passed,
            "multi_intent_accuracy": round(accuracy, 4),
            "target": 0.70,
            "pass": accuracy >= 0.70,
            "cases": details,
        }

    @staticmethod
    def _distinct_subqueries(subqueries: List[str]) -> List[str]:
        distinct: List[str] = []
        for sub in subqueries:
            cw = set(content_words(sub))
            duplicate = False
            for existing in distinct:
                ew = set(content_words(existing))
                if cw and ew and len(cw & ew) / len(cw | ew) >= 0.8:
                    duplicate = True
                    break
            if not duplicate:
                distinct.append(sub)
        return distinct

    # ------------------------------------------------------------------ G4
    def run_g4(self) -> Dict[str, Any]:
        details = []
        for case in GROUNDING_CASES:
            session = f"{case['session_id']}_{int(time.time() * 1000) % 100000}"
            turn = self.pipeline.process_turn(session, case["query"])
            verification = self.verify_turn(turn)
            self._accumulate_claims(turn)
            source_hit = (
                source_matches(case["expected_source"], turn.evidence)
                if case["expected_source"] else None
            )
            uncertainty_ok = (turn.uncertainty_flag is True) if case["expect_uncertainty"] else (turn.uncertainty_flag is False)
            details.append({
                "case": case["id"],
                "query": case["query"],
                "decision": turn.decision,
                "source_hit": source_hit,
                "uncertainty_flag": turn.uncertainty_flag,
                "uncertainty_expected": case["expect_uncertainty"],
                "uncertainty_ok": uncertainty_ok,
                "answer_preview": turn.answer[:180],
                "verification": verification,
            })
            self.results["cases"][case["id"]] = {
                "gate": "G4",
                "query": case["query"],
                "source_hit": source_hit,
                "uncertainty_flag": turn.uncertainty_flag,
                "answer_preview": turn.answer[:180],
                **verification,
            }
        claims = self.results["claims"]
        support_ratio = claims["supported"] / claims["total"] if claims["total"] else 0.0
        pass_gate = (
            support_ratio >= 0.85
            and claims["fabricated"] == 0
            and self.results["fabricated_citations"] == 0
        )
        return {
            "claim_support_ratio": round(support_ratio, 4),
            "total_verified_claims": claims["total"],
            "supported_claims": claims["supported"],
            "ungrounded_claims": claims["ungrounded"],
            "claims_with_fabricated_chunk_ids": claims["fabricated"],
            "fabricated_citations": self.results["fabricated_citations"],
            "target": 0.85,
            "pass": pass_gate,
            "cases": details,
        }

    # ------------------------------------------------------------------ G5
    def run_g5(self) -> Dict[str, Any]:
        passed = 0
        details = []
        for case in LATE_DETAIL_CASES:
            session = f"{case['session_id']}_{int(time.time() * 1000) % 100000}"
            first = self.pipeline.process_turn(session, case["initial"])
            self._accumulate_claims(first)
            prior_claim_texts = {c.text for c in first.claims}
            prior_chunk_ids = {c.chunk_id for c in first.citations}

            late = self.pipeline.process_turn(session, case["late"])
            self._accumulate_claims(late)

            new_claim_texts = {c.text for c in late.claims}
            preserved = bool(prior_claim_texts & new_claim_texts) or late.preserved_claim_count > 0
            state_continuity = bool(prior_chunk_ids) and (
                bool(prior_chunk_ids & {c.chunk_id for c in late.citations}) or preserved
            )
            ok = (
                late.decision == "RETRIEVE"
                and late.is_delta is True
                and late.retrieval_mode == "delta"
                and late.answer_version == first.answer_version + 1
                and all(e["trigger"] == "delta" for e in late.retrieval_events)
                and preserved
                and state_continuity
            )
            passed += int(ok)
            details.append({
                "case": case["id"],
                "initial": case["initial"],
                "late": case["late"],
                "late_decision": late.decision,
                "retrieval_mode": late.retrieval_mode,
                "is_delta": late.is_delta,
                "answer_version": late.answer_version,
                "preserved_claims": late.preserved_claim_count,
                "updated_claims": late.updated_claim_count,
                "preserved_prior_claim_texts": preserved,
                "state_continuity": state_continuity,
                "uncertainty": late.uncertainty,
                "pass": ok,
            })
            self.results["cases"][case["id"]] = {
                "gate": "G5",
                "late_decision": late.decision,
                "retrieval_mode": late.retrieval_mode,
                "answer_version": late.answer_version,
                "preserved_claims": late.preserved_claim_count,
                "pass": ok,
            }
        total = len(LATE_DETAIL_CASES)
        rate = passed / total if total else 0.0
        return {
            "late_detail_cases": total,
            "verified_continuity": passed,
            "session_refinement_rate": round(rate, 4),
            "pass": passed == total,
            "cases": details,
        }

    # ------------------------------------------------------------------ G6
    def run_g6(self) -> Dict[str, Any]:
        coverage = self.pipeline.telemetry_logger.trace_coverage()
        traces = self.pipeline.telemetry_logger.traces
        complete_traces = 0
        for trace in traces:
            ok = all(k in trace for k in (
                "timestamp_s", "session_id", "turn_id", "controller_decision",
                "retrieval_mode", "answer_version", "total_latency_ms",
            ))
            if trace["controller_decision"] == "RETRIEVE":
                ok = ok and bool(trace.get("retrieval_events"))
                ok = ok and trace.get("number_of_subqueries", 0) >= 1
            if trace["controller_decision"] == "SUPPRESS":
                ok = ok and trace.get("retrieval_mode") == "suppress"
            if ok:
                complete_traces += 1

        total = len(traces) or 1
        measured = complete_traces / total
        return {
            "traces": len(traces),
            "complete_traces": complete_traces,
            "trace_coverage": round(measured, 4),
            "logger_coverage": coverage,
            "target": 1.0,
            "pass": measured >= 1.0 and coverage["coverage"] >= 1.0,
        }

    # ------------------------------------------------------------ suppression
    def run_suppression(self) -> Dict[str, Any]:
        passed = 0
        details = []
        for case in SUPPRESSION_CASES:
            session = f"{case['session_id']}_{int(time.time() * 1000) % 100000}"
            seed_turn = self.pipeline.process_turn(session, case["seed"])
            self._accumulate_claims(seed_turn)
            turn = self.pipeline.process_turn(session, case["request"])

            no_retrieval = (
                turn.decision == "SUPPRESS"
                and turn.retrieval_required is False
                and not turn.retrieval_events
            )
            citations_retained = {c.chunk_id for c in turn.citations} == {c.chunk_id for c in seed_turn.citations}
            version_unchanged = turn.answer_version == seed_turn.answer_version
            bullets_ok = (turn.answer.count("\n- ") >= 1) if case["expect_bullets"] else True
            ok = no_retrieval and citations_retained and version_unchanged and bullets_ok and turn.reason == case["expect_reason"]
            passed += int(ok)
            details.append({
                "case": case["id"],
                "request": case["request"],
                "decision": turn.decision,
                "reason": turn.reason,
                "retrieval_required": turn.retrieval_required,
                "retrieval_events": len(turn.retrieval_events),
                "citations_retained": citations_retained,
                "answer_version_unchanged": version_unchanged,
                "bullets": case["expect_bullets"],
                "pass": ok,
            })
            self.results["cases"][case["id"]] = {"gate": "suppression", "pass": ok, **details[-1]}
        total = len(SUPPRESSION_CASES)
        rate = passed / total if total else 0.0
        return {
            "suppression_cases": total,
            "correct": passed,
            "suppression_accuracy": round(rate, 4),
            "pass": passed == total,
            "cases": details,
        }

    # -------------------------------------------------------------- ablations
    def run_ablations(self) -> Dict[str, Any]:
        dense_hits = hybrid_hits = total_sources = 0
        per_case = []
        for case in GROUNDING_CASES:
            if not case["expected_source"]:
                continue
            total_sources += 1
            query = case["query"]
            # Dense-only leg.
            dense_results = self.pipeline.retriever.dense_retriever.search(query, top_k=5)
            dense_hit = source_matches(case["expected_source"], dense_results)
            # Hybrid (recorded pipeline evidence for the same query).
            session = f"ablation_{case['id']}_{int(time.time() * 1000) % 100000}"
            turn = self.pipeline.process_turn(session, query)
            hybrid_hit = source_matches(case["expected_source"], turn.evidence)
            dense_hits += int(dense_hit)
            hybrid_hits += int(hybrid_hit)
            per_case.append({
                "case": case["id"],
                "expected_source": case["expected_source"],
                "dense_only_hit@5": dense_hit,
                "hybrid_hit@5": hybrid_hit,
            })

        # Controller policy ablation on streaming cases.
        ours_early = ours_false = baseline_early = baseline_false = 0
        eligible = wait_chunks = 0
        for case in STREAM_CASES:
            session = f"ablation_ctrl_{case['session_id']}_{int(time.time() * 1000) % 100000}"
            decisions = []
            first_retrieve = None
            for idx, chunk in enumerate(case["chunks"]):
                turn = self.pipeline.process_turn(session, chunk)
                decisions.append(turn.decision)
                if turn.decision == "RETRIEVE" and first_retrieve is None:
                    first_retrieve = idx
            if case.get("eligible_early_retrieval"):
                eligible += 1
                if first_retrieve is not None and first_retrieve < len(case["chunks"]) - 1:
                    ours_early += 1
                baseline_early += 1  # always-retrieve baseline fires immediately
            for actual, want in zip(decisions, case["expect"]["decisions"]):
                if want == "WAIT":
                    wait_chunks += 1
                    if actual == "RETRIEVE":
                        ours_false += 1
                    baseline_false += 1  # always-retrieve baseline fires on noise

        return {
            "retrieval_leg_ablation": {
                "description": "dense-only vs hybrid (dense+BM25+RRF+rerank) top-5 source hits",
                "expected_source_probes": total_sources,
                "dense_only_hits": dense_hits,
                "hybrid_hits": hybrid_hits,
                "dense_only_hit_rate": round(dense_hits / total_sources, 4) if total_sources else 0.0,
                "hybrid_hit_rate": round(hybrid_hits / total_sources, 4) if total_sources else 0.0,
                "cases": per_case,
            },
            "controller_policy_ablation": {
                "description": "intent-stability controller vs always-retrieve baseline",
                "eligible_early_cases": eligible,
                "ours_early_retrieval_cases": ours_early,
                "baseline_early_retrieval_cases": baseline_early,
                "wait_expected_chunks": wait_chunks,
                "ours_false_triggers": ours_false,
                "baseline_false_triggers": baseline_false,
                "ours_false_trigger_rate": round(ours_false / wait_chunks, 4) if wait_chunks else 0.0,
                "baseline_false_trigger_rate": round(baseline_false / wait_chunks, 4) if wait_chunks else 0.0,
            },
        }

    # ------------------------------------------------------------- edge cases
    def run_edge_cases(self) -> List[Dict[str, Any]]:
        probes: List[Dict[str, Any]] = []

        # 1. Corpus gap => explicit uncertainty, no fabricated citations.
        session = f"edge_gap_{int(time.time() * 1000) % 100000}"
        turn = self.pipeline.process_turn(session, "What is the submarine sonar calibration procedure?")
        self._accumulate_claims(turn)
        probes.append({
            "probe": "corpus_gap_uncertainty",
            "input": "What is the submarine sonar calibration procedure?",
            "decision": turn.decision,
            "uncertainty_flag": turn.uncertainty_flag,
            "uncertainty": turn.uncertainty,
            "citations": len(turn.citations),
            "answer_preview": turn.answer[:160],
        })

        # 2. Partial multi-intent coverage: one intent outside corpus.
        session = f"edge_partial_{int(time.time() * 1000) % 100000}"
        turn = self.pipeline.process_turn(
            session,
            "What does the ABS warning indicate and what is the catering policy?",
        )
        self._accumulate_claims(turn)
        probes.append({
            "probe": "partial_multi_intent_coverage",
            "input": "What does the ABS warning indicate and what is the catering policy?",
            "subqueries": turn.subqueries,
            "uncertainty_flag": turn.uncertainty_flag,
            "uncertainty": turn.uncertainty,
            "answer_preview": turn.answer[:200],
        })

        # 3. Provisional then completed utterance: version lineage.
        session = f"edge_lineage_{int(time.time() * 1000) % 100000}"
        first = self.pipeline.process_turn(session, "I need to know how to change a")
        second = self.pipeline.process_turn(session, "...tyre on my Aventro car")
        third = self.pipeline.process_turn(session, "and how do I open the boot?")
        self._accumulate_claims(first)
        self._accumulate_claims(second)
        self._accumulate_claims(third)
        probes.append({
            "probe": "provisional_version_lineage",
            "decisions": [first.decision, second.decision, third.decision],
            "modes": [first.retrieval_mode, second.retrieval_mode, third.retrieval_mode],
            "answer_versions": [first.answer_version, second.answer_version, third.answer_version],
            "lineage": third.telemetry.get("answer_version_lineage"),
        })

        # 4. Latency profile of a full retrieval turn.
        session = f"edge_latency_{int(time.time() * 1000) % 100000}"
        turn = self.pipeline.process_turn(session, "How do I tow my Aventro car safely?")
        self._accumulate_claims(turn)
        probes.append({
            "probe": "latency_profile",
            "total_latency_ms": turn.telemetry.get("total_latency_ms"),
            "dense_ms": turn.telemetry.get("dense_retrieval_latency_ms"),
            "sparse_ms": turn.telemetry.get("sparse_retrieval_latency_ms"),
            "fusion_ms": turn.telemetry.get("fusion_latency_ms"),
            "rerank_ms": turn.telemetry.get("reranking_latency_ms"),
            "synthesis_ms": turn.telemetry.get("synthesis_latency_ms"),
            "answer_ready_ms": turn.telemetry.get("ttft_ms"),
        })
        return probes

    def _accumulate_claims(self, turn):
        verification = self.verify_turn(turn)
        claims = self.results["claims"]
        claims["total"] += verification["claims_total"]
        claims["supported"] += verification["claims_supported"]
        claims["ungrounded"] += verification["claims_ungrounded"]
        claims["fabricated"] += verification["claims_fabricated"]
        self.results["fabricated_citations"] += verification["fabricated_citations"]

    # ---------------------------------------------------------------- report
    def run(self) -> Dict[str, Any]:
        started = time.time()
        print("=" * 72)
        print("Samsung Theme 4 - Streaming Live RAG benchmark (G2-G6)")
        print("=" * 72)

        g2 = self.run_g2()
        print(f"[G2] early retrieval rate = {g2['early_retrieval_rate']:.1%} (target >=80%)")
        g3 = self.run_g3()
        print(f"[G3] multi-intent accuracy = {g3['multi_intent_accuracy']:.1%} (target >=70%)")
        suppression = self.run_suppression()
        print(f"[suppression] accuracy = {suppression['suppression_accuracy']:.1%}")
        g4 = self.run_g4()
        print(f"[G4] claim support ratio = {g4['claim_support_ratio']:.1%} (target >=85%)")
        g5 = self.run_g5()
        print(f"[G5] session refinement rate = {g5['session_refinement_rate']:.1%}")
        g6 = self.run_g6()
        print(f"[G6] trace coverage = {g6['trace_coverage']:.1%} (target 100%)")

        ablations = self.run_ablations()
        edge_cases = self.run_edge_cases()
        g6 = self.run_g6()

        report = {
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "duration_s": round(time.time() - started, 2),
            "environment": {
                "python": sys.version.split()[0],
                "platform": platform.platform(),
                "corpus_chunks": len(self.corpus),
                "embedding_model": settings.LOCAL_EMBEDDING_MODEL,
                "reranker_model": settings.RERANKER_MODEL,
                "offline_fast_mode": os.getenv("TEST_OFFLINE_FAST", "0") == "1",
            },
            "G2": g2,
            "G3": g3,
            "G4": g4,
            "G5": g5,
            "G6": g6,
            "suppression": suppression,
            "ablations": ablations,
            "edge_cases": edge_cases,
            "cases": self.results["cases"],
        }
        return report


def write_report(report: Dict[str, Any]) -> Path:
    results_dir = ROOT / "benchmark" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    json_path = results_dir / "benchmark_results.json"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    md = render_markdown(report)
    md_path = results_dir / "BENCHMARK_REPORT.md"
    md_path.write_text(md, encoding="utf-8")
    return md_path


def render_markdown(report: Dict[str, Any]) -> str:
    env = report["environment"]
    g2, g3, g4, g5, g6 = report["G2"], report["G3"], report["G4"], report["G5"], report["G6"]
    sup = report["suppression"]
    abl = report["ablations"]

    lines = []
    lines.append("# Samsung Theme 4 - Benchmark & Evaluation Report")
    lines.append("")
    lines.append(f"- Generated: {report['generated_at']}")
    lines.append(f"- Harness duration: {report['duration_s']}s")
    lines.append(f"- Python: {env['python']} on {env['platform']}")
    lines.append(f"- Corpus chunks indexed: {env['corpus_chunks']}")
    lines.append(f"- Embedding model: `{env['embedding_model']}`")
    lines.append(f"- Reranker model: `{env['reranker_model']}`")
    lines.append(f"- Offline fast mode: {env['offline_fast_mode']}")
    lines.append("")
    lines.append("## Gate Summary")
    lines.append("")
    lines.append("| Gate | Criterion | Target | Result |")
    lines.append("|---|---|---|---|")
    lines.append(f"| G1 | Reproducibility | pass/fail | see README / run.py |")
    lines.append(f"| G2 | Early retrieval | >= 80% | {g2['early_retrieval_rate']:.1%} ({'PASS' if g2['pass'] else 'FAIL'}) |")
    lines.append(f"| G3 | Multi-intent identification | >= 70% | {g3['multi_intent_accuracy']:.1%} ({'PASS' if g3['pass'] else 'FAIL'}) |")
    lines.append(f"| G4 | Factual grounding | >= 85% | {g4['claim_support_ratio']:.1%} ({'PASS' if g4['pass'] else 'FAIL'}) |")
    lines.append(f"| G5 | Session refinement | verified | {g5['verified_continuity']}/{g5['late_detail_cases']} ({'PASS' if g5['pass'] else 'FAIL'}) |")
    lines.append(f"| G6 | Telemetry trace coverage | 100% | {g6['trace_coverage']:.1%} ({'PASS' if g6['pass'] else 'FAIL'}) |")
    lines.append("")
    lines.append("## G2 - Early Retrieval")
    lines.append("")
    lines.append(f"- Eligible streaming cases: {g2['eligible_cases']}")
    lines.append(f"- Retrieval began before final transcript chunk: {g2['early_retrieval_cases']}")
    lines.append(f"- Controller decision accuracy vs expectations: {g2['controller_decision_accuracy']:.1%}")
    lines.append(f"- False-trigger rate on semantically unstable fragments: {g2['false_trigger_rate_on_unstable_fragments']:.1%}")
    lines.append("")
    for case in g2["cases"]:
        lines.append(f"- `{case['case']}`: decisions={case['decisions']} expected={case['expected_decisions']} "
                     f"first_retrieve_chunk={case['first_retrieve_chunk_index']} early={case['early_retrieval']}")
    lines.append("")
    lines.append("## G3 - Multi-Intent Identification")
    lines.append("")
    for case in g3["cases"]:
        lines.append(f"- `{case['case']}`: {case['subqueries']} (required >= {case['min_required']}, "
                     f"no near-duplicates={case['no_near_duplicates']}, pass={case['pass']})")
    lines.append("")
    lines.append("## G4 - Factual Grounding")
    lines.append("")
    lines.append(f"- Verified claims: {g4['total_verified_claims']}")
    lines.append(f"- Supported by cited corpus chunk (coverage >= {CLAIM_SUPPORT_THRESHOLD}): {g4['supported_claims']}")
    lines.append(f"- Ungrounded claims: {g4['ungrounded_claims']}")
    lines.append(f"- Claims citing fabricated chunk ids: {g4['claims_with_fabricated_chunk_ids']}")
    lines.append(f"- Fabricated citations: {g4['fabricated_citations']}")
    lines.append("")
    for case in g4["cases"]:
        lines.append(f"- `{case['case']}`: uncertainty={case['uncertainty_flag']} (expected {case['uncertainty_expected']}), "
                     f"source_hit={case['source_hit']}, answer=`{case['answer_preview']}`")
    lines.append("")
    lines.append("## G5 - Session Refinement")
    lines.append("")
    for case in g5["cases"]:
        lines.append(f"- `{case['case']}`: mode={case['retrieval_mode']} delta={case['is_delta']} "
                     f"version={case['answer_version']} preserved_claims={case['preserved_claims']} "
                     f"state_continuity={case['state_continuity']} pass={case['pass']}")
    lines.append("")
    lines.append("## Suppression (Presentation-Only Turns)")
    lines.append("")
    lines.append(f"- Accuracy: {sup['suppression_accuracy']:.1%}")
    for case in sup["cases"]:
        lines.append(f"- `{case['case']}`: decision={case['decision']} reason={case['reason']} "
                     f"retrieval_events={case['retrieval_events']} citations_retained={case['citations_retained']}")
    lines.append("")
    lines.append("## G6 - Telemetry")
    lines.append("")
    lines.append(f"- Traces captured: {g6['traces']}")
    lines.append(f"- Complete traces: {g6['complete_traces']}")
    lines.append(f"- Trace coverage: {g6['trace_coverage']:.1%}")
    lines.append("")
    lines.append("## Ablations")
    lines.append("")
    leg = abl["retrieval_leg_ablation"]
    lines.append(f"### Retrieval leg: dense-only vs hybrid (top-5 source hits)")
    lines.append(f"- Dense-only: {leg['dense_only_hits']}/{leg['expected_source_probes']} = {leg['dense_only_hit_rate']:.1%}")
    lines.append(f"- Hybrid (dense+BM25+RRF+rerank): {leg['hybrid_hits']}/{leg['expected_source_probes']} = {leg['hybrid_hit_rate']:.1%}")
    ctrl = abl["controller_policy_ablation"]
    lines.append("")
    lines.append("### Controller policy: intent-stability vs always-retrieve baseline")
    lines.append(f"- Early retrieval: ours {ctrl['ours_early_retrieval_cases']}/{ctrl['eligible_early_cases']}, "
                 f"baseline {ctrl['baseline_early_retrieval_cases']}/{ctrl['eligible_early_cases']}")
    lines.append(f"- False triggers on unstable chunks: ours {ctrl['ours_false_triggers']}/{ctrl['wait_expected_chunks']} "
                 f"({ctrl['ours_false_trigger_rate']:.1%}), baseline {ctrl['baseline_false_triggers']}/{ctrl['wait_expected_chunks']} "
                 f"({ctrl['baseline_false_trigger_rate']:.1%})")
    lines.append("")
    lines.append("## Edge-Case Analysis")
    lines.append("")
    for probe in report["edge_cases"]:
        lines.append(f"### {probe['probe']}")
        for key, value in probe.items():
            if key == "probe":
                continue
            lines.append(f"- {key}: `{value}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    runner = BenchmarkRunner()
    report = runner.run()
    md_path = write_report(report)
    print("=" * 72)
    print(f"Report written to: {md_path}")
    gates = {g: report[g]["pass"] for g in ("G2", "G3", "G4", "G5", "G6")}
    print(f"Gate results: {gates}")
    return 0 if all(gates.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
