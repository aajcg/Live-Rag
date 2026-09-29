"use client";

import { useState } from "react";
import { Code, Copy, Check, Play, Loader2, Sparkles } from "lucide-react";

const endpoints = [
  {
    method: "GET",
    path: "/health",
    description: "System health status check",
    body: null,
    sampleResponse: `{
  "status": "ok"
}`,
  },
  {
    method: "GET",
    path: "/rag/ready",
    description: "Check if the Aventro Motors corpus index is built and ready for search",
    body: null,
    sampleResponse: `{
  "ready": true,
  "indexed_chunks": 133,
  "corpus": "Aventro Motors",
  "embedding_provider": "sentence_transformers",
  "status": "Aventro Motors corpus ready"
}`,
  },
  {
    method: "POST",
    path: "/rag/retrieve",
    description: "Direct vector + BM25 hybrid search with cross-encoder reranking",
    body: `{
  "query": "What is the recommended tire pressure for Aventro models?",
  "top_k": 3
}`,
    sampleResponse: `[
  {
    "chunk_id": "chk_024",
    "document_title": "Aventro X5 Owner Manual",
    "source_file": "Aventro_X5_Manual.pdf",
    "page_number": 42,
    "score": 0.892,
    "text": "Tire pressure specifications..."
  }
]`,
  },
  {
    method: "POST",
    path: "/rag/answer",
    description: "Synchronous turn processor returning grounded answer with citations and telemetry",
    body: `{
  "session_id": "api_test_session",
  "transcript_chunk": "What does the ABS warning indicate?"
}`,
    sampleResponse: `{
  "session_id": "api_test_session",
  "turn_id": "turn_1727618000",
  "decision": "RETRIEVE",
  "answer": "The ABS warning indicates a malfunction in the anti-lock brake system...",
  "citations": [
    { "chunk_id": "chk_089", "label": "Aventro Technical Specs, p.14" }
  ],
  "claims": [
    { "text": "Indicates anti-lock brake system fault", "grounded": true }
  ],
  "uncertainty_flag": false,
  "telemetry": {
    "total_latency_ms": 284,
    "ttft_ms": 110
  }
}`,
  },
  {
    method: "POST",
    path: "/rag/answer/stream",
    description: "High-performance Server-Sent Events (SSE) streaming endpoint for live transcription",
    body: `{
  "session_id": "stream_test_session",
  "transcript_chunk": "Compare the warranty terms between X5 and X7."
}`,
    sampleResponse: `event: decision
data: {"decision": "RETRIEVE", "trigger": "terminal_punctuation"}

event: retrieval_started
data: {"subqueries": ["X5 warranty coverage", "X7 warranty coverage"]}

event: evidence
data: {"citations": [...]}

event: token
data: {"token": "The"}

event: token
data: {"token": " Aventro"}

event: complete
data: {"telemetry": {...}}`,
  },
  {
    method: "GET",
    path: "/metrics",
    description: "Real-time observability telemetry, trace coverage, and latency metrics",
    body: null,
    sampleResponse: `{
  "total_traces": 42,
  "trace_coverage": 1.0,
  "sessions": 5,
  "traces": [...]
}`,
  },
];

export default function APIDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(endpoints[0]);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestEndpoint = async () => {
    setIsTesting(true);
    setTestResult(null);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      let res: Response;
      if (selectedEndpoint.method === "GET") {
        res = await fetch(`${API_URL}${selectedEndpoint.path}`);
      } else {
        res = await fetch(`${API_URL}${selectedEndpoint.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: selectedEndpoint.body || JSON.stringify({}),
        });
      }

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setTestResult(JSON.stringify(json, null, 2));
      } catch {
        setTestResult(text);
      }
    } catch (err: any) {
      setTestResult(`Error calling endpoint: ${err.message}\nMake sure backend is running on port 8000.`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-[1300px] mx-auto px-6">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-xs font-medium text-brand-indigo mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            FastAPI + SSE Interactive Reference
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">API Documentation</h1>
          <p className="text-secondary text-sm mt-1">
            RESTful endpoints with Server-Sent Events (SSE) for streaming conversational live retrieval.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Endpoint list */}
          <div className="lg:col-span-1 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted px-1 block mb-2">
              Endpoints
            </span>
            {endpoints.map((endpoint) => (
              <button
                key={endpoint.path}
                onClick={() => {
                  setSelectedEndpoint(endpoint);
                  setTestResult(null);
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedEndpoint.path === endpoint.path
                    ? "border-brand-indigo bg-brand-indigo/10 shadow-sm"
                    : "border-subtle hover:border-default bg-surface"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      endpoint.method === "GET"
                        ? "bg-semantic-emerald/15 text-semantic-emerald"
                        : "bg-brand-indigo/20 text-brand-indigo"
                    }`}
                  >
                    {endpoint.method}
                  </span>
                </div>
                <code className="text-xs font-mono text-secondary break-all">
                  {endpoint.path}
                </code>
              </button>
            ))}
          </div>

          {/* Endpoint details & tester */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 rounded-2xl bg-surface border border-subtle">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold ${
                      selectedEndpoint.method === "GET"
                        ? "bg-semantic-emerald/15 text-semantic-emerald"
                        : "bg-brand-indigo/20 text-brand-indigo"
                    }`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <code className="text-base font-semibold font-mono text-primary">
                    {selectedEndpoint.path}
                  </code>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestEndpoint}
                    disabled={isTesting}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-brand text-white font-medium text-xs hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    Send Request
                  </button>

                  <button
                    onClick={() => copyToClipboard(selectedEndpoint.path)}
                    className="p-2 rounded-lg bg-elevated hover:bg-hover transition-colors text-muted hover:text-primary border border-subtle"
                    title="Copy path"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-semantic-emerald" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <p className="text-secondary text-sm mb-6">{selectedEndpoint.description}</p>

              {/* Request Body if applicable */}
              {selectedEndpoint.body && (
                <div className="mb-6">
                  <span className="text-xs font-semibold text-primary block mb-2">Request Body (JSON)</span>
                  <pre className="p-4 rounded-xl bg-base border border-subtle overflow-x-auto text-xs font-mono text-secondary">
                    <code>{selectedEndpoint.body}</code>
                  </pre>
                </div>
              )}

              {/* Live Test Result (if triggered) */}
              {testResult && (
                <div className="mb-6">
                  <span className="text-xs font-semibold text-semantic-emerald flex items-center gap-1.5 mb-2">
                    <Check className="w-3.5 h-3.5" />
                    Live Backend Response:
                  </span>
                  <pre className="p-4 rounded-xl bg-base border border-brand-indigo/40 overflow-x-auto text-xs font-mono text-primary max-h-72 overflow-y-auto">
                    <code>{testResult}</code>
                  </pre>
                </div>
              )}

              {/* Sample Response */}
              <div>
                <span className="text-xs font-semibold text-primary block mb-2">
                  Schema / Sample Response
                </span>
                <pre className="p-4 rounded-xl bg-base border border-subtle overflow-x-auto text-xs font-mono text-secondary max-h-72 overflow-y-auto">
                  <code>{selectedEndpoint.sampleResponse}</code>
                </pre>
              </div>
            </div>

            {/* Server-Sent Events Sequence */}
            <div className="p-6 rounded-2xl bg-surface border border-subtle">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-primary">
                <Code className="w-4 h-4 text-brand-indigo" />
                Server-Sent Events (SSE) Protocol Order
              </h3>
              <p className="text-xs text-secondary mb-4 leading-relaxed">
                When connecting to <code className="text-brand-indigo font-mono">/rag/answer/stream</code>, events arrive progressively over HTTP:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-elevated border border-subtle">
                  <div className="text-brand-amber font-semibold">1. decision</div>
                  <div className="text-[11px] text-muted font-sans mt-0.5">WAIT / RETRIEVE</div>
                </div>
                <div className="p-2.5 rounded-lg bg-elevated border border-subtle">
                  <div className="text-brand-cyan font-semibold">2. retrieval_started</div>
                  <div className="text-[11px] text-muted font-sans mt-0.5">Atomic subqueries</div>
                </div>
                <div className="p-2.5 rounded-lg bg-elevated border border-subtle">
                  <div className="text-brand-indigo font-semibold">3. evidence</div>
                  <div className="text-[11px] text-muted font-sans mt-0.5">Retrieved citations</div>
                </div>
                <div className="p-2.5 rounded-lg bg-elevated border border-subtle">
                  <div className="text-brand-violet font-semibold">4. token & complete</div>
                  <div className="text-[11px] text-muted font-sans mt-0.5">Tokens & telemetry</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
