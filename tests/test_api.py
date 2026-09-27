import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"

def test_ready_endpoint():
    response = client.get("/rag/ready")
    assert response.status_code == 200
    data = response.json()
    assert "ready" in data
    assert "indexed_chunks" in data

def test_answer_endpoint_wait():
    payload = {
        "session_id": "test_api_sess",
        "transcript_chunk": "I want to know about"
    }
    response = client.post("/rag/answer", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "WAIT"

def test_answer_endpoint_retrieve():
    payload = {
        "session_id": "test_api_sess_2",
        "transcript_chunk": "What is the policy for return refund?"
    }
    response = client.post("/rag/answer", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "RETRIEVE"

def test_session_endpoint():
    client.post("/rag/answer", json={"session_id": "sess_api_3", "transcript_chunk": "What are the rules?"})
    response = client.get("/rag/session/sess_api_3")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "sess_api_3"

def test_answer_stream_endpoint():
    payload = {
        "session_id": "sess_stream_test",
        "transcript_chunk": "What is the policy for warranty coverage?"
    }
    response = client.post("/rag/answer/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    content = response.text
    assert "event: decision" in content
    assert "event: ttft" in content
    assert "event: complete" in content
