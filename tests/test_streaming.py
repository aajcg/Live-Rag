import pytest
import json
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def _event_pairs(body):
    pairs = []
    for block in [b for b in body.split("\n\n") if b.strip()]:
        name = None
        data = None
        for line in block.split("\n"):
            if line.startswith("event: "):
                name = line[len("event: "):].strip()
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        pairs.append((name, data))
    return pairs


def test_sse_streaming_events():
    payload = {
        "session_id": "sess_streaming_test_101",
        "transcript_chunk": "Does the Aventro Zoom have adaptive cruise control?"
    }
    response = client.post("/rag/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    pairs = _event_pairs(response.text)
    event_names = [name for name, _ in pairs]
    assert len(pairs) >= 3

    assert "decision" in event_names
    assert "ttft" in event_names
    assert "token" in event_names
    assert "complete" in event_names


def test_sse_event_ordering_for_retrieval():
    payload = {
        "session_id": "sess_streaming_order_1",
        "transcript_chunk": "What does the default warranty cover?"
    }
    response = client.post("/rag/answer/stream", json=payload)
    assert response.status_code == 200
    pairs = _event_pairs(response.text)
    names = [name for name, _ in pairs]

    assert names[0] == "decision"
    assert "retrieval_started" in names
    assert names.index("decision") < names.index("retrieval_started") < names.index("evidence")
    assert names.index("evidence") < names.index("ttft") < names.index("complete")
    assert names.count("complete") == 1

    decision_data = pairs[0][1]
    assert decision_data["retrieval_required"] is True
    assert decision_data["trigger"] in ("full", "provisional")

    complete_data = pairs[-1][1]
    assert "retrieval_events" in complete_data
    assert "output_record" in complete_data


def test_sse_streaming_wait_event():
    payload = {
        "session_id": "sess_streaming_wait_102",
        "transcript_chunk": "I want to ask about"
    }
    response = client.post("/rag/answer/stream", json=payload)
    assert response.status_code == 200
    pairs = _event_pairs(response.text)
    names = [name for name, _ in pairs]
    assert names[0] == "decision"
    decision_data = pairs[0][1]
    assert decision_data["decision"] == "WAIT"
    assert decision_data["retrieval_required"] is False
    assert "retrieval_started" not in names


def test_sse_suppression_has_no_retrieval_events():
    client.post("/rag/answer", json={
        "session_id": "sess_streaming_suppress",
        "transcript_chunk": "What does the default warranty cover?",
    })
    response = client.post("/rag/stream", json={
        "session_id": "sess_streaming_suppress",
        "transcript_chunk": "Please repeat your last answer in two bullets.",
    })
    pairs = _event_pairs(response.text)
    names = [name for name, _ in pairs]
    assert "retrieval_started" not in names
    assert pairs[0][1]["decision"] == "SUPPRESS"
    assert pairs[0][1]["retrieval_required"] is False
