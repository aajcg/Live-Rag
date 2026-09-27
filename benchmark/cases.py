"""Held-out benchmark cases for the Samsung Theme 4 evaluation gates.

Expectations describe *behavioral criteria only* (controller decisions, intent
counts, source hints, refinement behavior). No expected answers, citations or
per-question canned outputs exist anywhere in this repository.
"""

STREAM_CASES = [
    {
        "id": "stream_multi_intent_early_tyre_boot_alerts",
        "session_id": "bench_stream_tyre_boot",
        "chunks": [
            "I need to know how to change a...",
            "...tyre on my Aventro car, and...",
            "...how to open the boot and what the warning alerts mean.",
        ],
        "expect": {
            "decisions": ["WAIT", "RETRIEVE", "RETRIEVE"],
            "retrieve_before_final": True,
            "min_final_subqueries": 2,
            "expected_sources": ["Tyre", "Boot", "Warning"],
        },
        "eligible_early_retrieval": True,
    },
    {
        "id": "stream_spec_style_workshop",
        "session_id": "bench_stream_workshop",
        "chunks": [
            "I need to plan a customer workshop in...",
            "...Pune for 30 people, and I need...",
            "...the cancellation policy and the catering options.",
        ],
        "expect": {
            "decisions": ["WAIT", "RETRIEVE", "RETRIEVE"],
            "retrieve_before_final": True,
            "min_final_subqueries": 2,
            "expected_sources": [],
        },
        "eligible_early_retrieval": True,
    },
    {
        "id": "stream_single_chunk_not_early_eligible",
        "session_id": "bench_stream_single",
        "chunks": ["What does the ABS warning light indicate?"],
        "expect": {
            "decisions": ["RETRIEVE"],
            "retrieve_before_final": False,
            "min_final_subqueries": 1,
            "expected_sources": ["ABS"],
        },
        "eligible_early_retrieval": False,
    },
]

COMPOUND_CASES = [
    {
        "id": "compound_abs_traction_lane",
        "session_id": "bench_compound_abs",
        "query": (
            "What does the ABS warning indicate, how does traction control work, "
            "and what does lane keeping assist do?"
        ),
        "expect": {
            "min_subqueries": 3,
            "expected_sources": ["ABS", "Traction", "Lane Keeping"],
        },
    },
    {
        "id": "compound_zoom_price_cruise",
        "session_id": "bench_compound_zoom",
        "query": "What is the price of the Aventro Zoom SUV and does it have adaptive cruise control?",
        "expect": {
            "min_subqueries": 2,
            "expected_sources": ["Zoom", "Cruise"],
        },
    },
]

GROUNDING_CASES = [
    {"id": "g_tyre", "session_id": "bench_g_tyre", "query": "How do I change a tyre on the Aventro car?",
     "expected_source": "Tyre", "expect_uncertainty": False},
    {"id": "g_abs", "session_id": "bench_g_abs", "query": "What does the ABS warning indicate?",
     "expected_source": "ABS", "expect_uncertainty": False},
    {"id": "g_cruise", "session_id": "bench_g_cruise", "query": "Does the Aventro Zoom have adaptive cruise control?",
     "expected_source": "Cruise", "expect_uncertainty": False},
    {"id": "g_boot", "session_id": "bench_g_boot", "query": "How do I open the boot?",
     "expected_source": "Boot", "expect_uncertainty": False},
    {"id": "g_preowned", "session_id": "bench_g_preowned", "query": "What are pre-owned certified cars?",
     "expected_source": "Pre-Owned", "expect_uncertainty": False},
    {"id": "g_engine", "session_id": "bench_g_engine", "query": "How to handle engine wont start issue?",
     "expected_source": "Engine", "expect_uncertainty": False},
    {"id": "g_tow", "session_id": "bench_g_tow", "query": "How do I tow my Aventro car safely?",
     "expected_source": "Tow", "expect_uncertainty": False},
    {"id": "g_paraphrase_start", "session_id": "bench_g_start", "query": "My car refuses to start, what should I do?",
     "expected_source": "Engine", "expect_uncertainty": False},
    {"id": "g_paraphrase_thirdparty", "session_id": "bench_g_thirdparty",
     "query": "What are the rules for third party accessories?", "expected_source": "Party", "expect_uncertainty": False},
    {"id": "g_paraphrase_door", "session_id": "bench_g_door",
     "query": "The car key remote battery is dead, how do I open the door?",
     "expected_source": "Door", "expect_uncertainty": False},
    {"id": "g_gap", "session_id": "bench_g_gap", "query": "What is the submarine sonar calibration procedure?",
     "expected_source": None, "expect_uncertainty": True},
]

SUPPRESSION_CASES = [
    {
        "id": "s_repeat_bullets",
        "session_id": "bench_suppress_bullets",
        "seed": "What should I check before a long drive?",
        "request": "Please repeat your last answer in two bullets.",
        "expect_reason": "presentation_restructure",
        "expect_bullets": True,
    },
    {
        "id": "s_shorter",
        "session_id": "bench_suppress_shorter",
        "seed": "How do I start the Aventro car?",
        "request": "Make it shorter",
        "expect_reason": "presentation_restructure",
        "expect_bullets": False,
    },
]

LATE_DETAIL_CASES = [
    {
        "id": "ld_preowned_discourse",
        "session_id": "bench_ld_preowned",
        "initial": "What is the procedure to sell my Aventro car?",
        "late": "Actually the car is a pre-owned certified vehicle and the paperwork was done after the warranty ended.",
    },
    {
        "id": "ld_international",
        "session_id": "bench_ld_international",
        "initial": "What are the service center locations?",
        "late": "I mean for international trips and the inspection was done after the service interval.",
    },
]
