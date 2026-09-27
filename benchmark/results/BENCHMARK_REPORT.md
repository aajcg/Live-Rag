# Samsung Theme 4 - Benchmark & Evaluation Report

- Generated: 2026-09-27 12:02:07
- Harness duration: 135.25s
- Python: 3.14.4 on Windows-11-10.0.26200-SP0
- Corpus chunks indexed: 133
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- Reranker model: `cross-encoder/ms-marco-MiniLM-L-6-v2`
- Offline fast mode: False

## Gate Summary

| Gate | Criterion | Target | Result |
|---|---|---|---|
| G1 | Reproducibility | pass/fail | see README / run.py |
| G2 | Early retrieval | >= 80% | 100.0% (PASS) |
| G3 | Multi-intent identification | >= 70% | 100.0% (PASS) |
| G4 | Factual grounding | >= 85% | 100.0% (PASS) |
| G5 | Session refinement | verified | 2/2 (PASS) |
| G6 | Telemetry trace coverage | 100% | 100.0% (PASS) |

## G2 - Early Retrieval

- Eligible streaming cases: 2
- Retrieval began before final transcript chunk: 2
- Controller decision accuracy vs expectations: 100.0%
- False-trigger rate on semantically unstable fragments: 0.0%

- `stream_multi_intent_early_tyre_boot_alerts`: decisions=['WAIT', 'RETRIEVE', 'RETRIEVE'] expected=['WAIT', 'RETRIEVE', 'RETRIEVE'] first_retrieve_chunk=1 early=True
- `stream_spec_style_workshop`: decisions=['WAIT', 'RETRIEVE', 'RETRIEVE'] expected=['WAIT', 'RETRIEVE', 'RETRIEVE'] first_retrieve_chunk=1 early=True
- `stream_single_chunk_not_early_eligible`: decisions=['RETRIEVE'] expected=['RETRIEVE'] first_retrieve_chunk=0 early=False

## G3 - Multi-Intent Identification

- `compound_abs_traction_lane`: ['What does the ABS warning indicate?', 'how does traction control work?', 'what does lane keeping assist do?'] (required >= 3, no near-duplicates=True, pass=True)
- `compound_zoom_price_cruise`: ['What is the price of the Aventro Zoom SUV?', 'does it have adaptive cruise control?'] (required >= 2, no near-duplicates=True, pass=True)

## G4 - Factual Grounding

- Verified claims: 43
- Supported by cited corpus chunk (coverage >= 0.55): 43
- Ungrounded claims: 0
- Claims citing fabricated chunk ids: 0
- Fabricated citations: 0

- `g_tyre`: uncertainty=False (expected False), source_hit=True, answer=`Steps to Change a Tyre 1. [ Aventro Motors- How to Change a Tyre.pdf, p.1] Aventro Motors: How to Change a Tyre Changing a flat tyre is a basic and essential automotive skill for e`
- `g_abs`: uncertainty=False (expected False), source_hit=True, answer=`ABS Warning Light • Meaning: Indicates a malfunction in the Anti-lock Braking System. [Instrument Cluster Warning Alerts.pdf, p.1] Oil Pressure Warning Light • Meaning: Low oil pre`
- `g_cruise`: uncertainty=False (expected False), source_hit=True, answer=`What is Adaptive Cruise Control? [Adaptive Cruise Control (ACC).pdf, p.1] How Does Adaptive Cruise Control Work? [Adaptive Cruise Control (ACC).pdf, p.1]`
- `g_boot`: uncertainty=False (expected False), source_hit=True, answer=`• Lift the boot gently to open. [Opening and Closing the Boot.pdf, p.1] • Go to the rear of the vehicle and lift the boot lid upwards to open. [Opening and Closing the Boot.pdf, p.`
- `g_preowned`: uncertainty=False (expected False), source_hit=True, answer=`Pre-Owned Certified Cars Why Choose Aventro Certified Pre-Owned Cars? [Pre-Owned Certified Cars.pdf, p.1] Aventro Tower, Sector 18, Gurugram, Haryana 122018, India ￿+91 124 1234567`
- `g_engine`: uncertainty=False (expected False), source_hit=True, answer=`The engine will start. [How to Start Your Aventro Car.pdf, p.1] How to Handle “Engine Won’t Start” Issue When your Aventro vehicle’s engine refuses to start, it can be frustrating.`
- `g_tow`: uncertainty=False (expected False), source_hit=True, answer=`How to Tow Your Aventro Car Whether you’ve had a breakdown, a minor accident, or just need to move your Aventro vehicle, towing it safely is critical. [How to Tow Your Aventro Car.`
- `g_paraphrase_start`: uncertainty=False (expected False), source_hit=True, answer=`How to Handle “Engine Won’t Start” Issue When your Aventro vehicle’s engine refuses to start, it can be frustrating. [How to Handle Engine Wont Start Issue.pdf, p.1] • The car may `
- `g_paraphrase_thirdparty`: uncertainty=False (expected False), source_hit=True, answer=`– Complimentary accessories kit on select models. [Discounts.pdf, p.1] Do’s and Don’ts About 3rd Party Accessories & Electrical Accessories for Your Car When it comes to enhancing `
- `g_paraphrase_door`: uncertainty=False (expected False), source_hit=True, answer=`How to Open the Door When the Car Key Re- mote Battery is Dead If your Aventro Motors car key remote battery is dead and you’re unable to unlock your car using the remote, you can `
- `g_gap`: uncertainty=True (expected True), source_hit=None, answer=`This request could not be verified from the available corpus. The retrieved corpus does not contain evidence for: 'What is the submarine sonar calibration procedure'.`

## G5 - Session Refinement

- `ld_preowned_discourse`: mode=delta delta=True version=2 preserved_claims=2 state_continuity=True pass=True
- `ld_international`: mode=delta delta=True version=2 preserved_claims=2 state_continuity=True pass=True

## Suppression (Presentation-Only Turns)

- Accuracy: 100.0%
- `s_repeat_bullets`: decision=SUPPRESS reason=presentation_restructure retrieval_events=0 citations_retained=True
- `s_shorter`: decision=SUPPRESS reason=presentation_restructure retrieval_events=0 citations_retained=True

## G6 - Telemetry

- Traces captured: 51
- Complete traces: 51
- Trace coverage: 100.0%

## Ablations

### Retrieval leg: dense-only vs hybrid (top-5 source hits)
- Dense-only: 10/10 = 100.0%
- Hybrid (dense+BM25+RRF+rerank): 10/10 = 100.0%

### Controller policy: intent-stability vs always-retrieve baseline
- Early retrieval: ours 2/2, baseline 2/2
- False triggers on unstable chunks: ours 0/2 (0.0%), baseline 2/2 (100.0%)

## Edge-Case Analysis

### corpus_gap_uncertainty
- input: `What is the submarine sonar calibration procedure?`
- decision: `RETRIEVE`
- uncertainty_flag: `True`
- uncertainty: `The retrieved corpus does not contain evidence for: 'What is the submarine sonar calibration procedure'.`
- citations: `0`
- answer_preview: `This request could not be verified from the available corpus. The retrieved corpus does not contain evidence for: 'What is the submarine sonar calibration proce`

### partial_multi_intent_coverage
- input: `What does the ABS warning indicate and what is the catering policy?`
- subqueries: `['What does the ABS warning indicate?', 'what is the catering policy?']`
- uncertainty_flag: `True`
- uncertainty: `Evidence for the following sub-intent is limited and could not be fully verified: 'what is the catering policy'.`
- answer_preview: `ABS Warning Light • Meaning: Indicates a malfunction in the Anti-lock Braking System. [Instrument Cluster Warning Alerts.pdf, p.1] Terms & Conditions • Discounts subject to availability of models/vari`

### provisional_version_lineage
- decisions: `['RETRIEVE', 'RETRIEVE', 'RETRIEVE']`
- modes: `['provisional', 'delta', 'delta']`
- answer_versions: `[1, 2, 3]`
- lineage: `[1, 2, 3]`

### latency_profile
- total_latency_ms: `1510.28`
- dense_ms: `69.78`
- sparse_ms: `10.26`
- fusion_ms: `0.38`
- rerank_ms: `1423.15`
- synthesis_ms: `5.64`
- answer_ready_ms: `1510.24`
