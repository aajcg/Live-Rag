"use client";

import { useState } from "react";
import { Code, Copy, Check, Play } from "lucide-react";

const endpoints = [
  {
    method: "GET",
    path: "/health",
    description: "Health check endpoint",
    response: `{
  "status": "ok"
}`,
  },
  {
    method: "GET",
    path: "/rag/ready",
    description: "Check if corpus is indexed and ready",
    response: `{
  "ready": true,
  "chunk_count": 133
}`,
  },
  {
    method: "POST",
    path: "/rag/answer",
    description: "Synchronous answer endpoint",
    body: `{
  "session_id": "demo",
  "transcript_chunk": "What does the ABS warning indicate?"
}`,
    response: `{
  "answer": "The ABS warning indicates...",
  "citations": ["chk_abc123"],
  "claims": [...],
  "telemetry": {...}
}`,
  },
  {
    method: "POST",
    path: "/rag/answer/stream",
    description: "Streaming SSE endpoint",
    body: `{
  "session_id": "demo",
  "transcript_chunk": "What does the ABS warning indicate?"
}`,
    response: `SSE events: decision, retrieval_started, evidence, claims, token, complete`,
  },
  {
    method: "GET",
    path: "/rag/session/{session_id}",
    description: "Get session state",
    response: `{
  "session_id": "demo",
  "transcript_buffer": "",
  "answer_version": 1,
  "previous_answer": "...",
  "previous_evidence": [...]
}`,
  },
];

export default function APIDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(endpoints[2]);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen pt-20">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold mb-2">API Documentation</h1>
        <p className="text-secondary mb-8">
          RESTful endpoints with Server-Sent Events for streaming responses.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Endpoint list */}
          <div className="lg:col-span-1 space-y-2">
            {endpoints.map((endpoint) => (
              <button
                key={endpoint.path}
                onClick={() => setSelectedEndpoint(endpoint)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedEndpoint.path === endpoint.path
                    ? "border-brand-indigo bg-brand-indigo/5"
                    : "border-subtle hover:border-default"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                      endpoint.method === "GET"
                        ? "bg-semantic-emerald/10 text-semantic-emerald"
                        : "bg-brand-indigo/10 text-brand-indigo"
                    }`}
                  >
                    {endpoint.method}
                  </span>
                </div>
                <code className="text-sm text-secondary break-all">
                  {endpoint.path}
                </code>
              </button>
            ))}
          </div>

          {/* Endpoint details */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 rounded-xl bg-surface border border-subtle">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded text-sm font-mono font-medium ${
                      selectedEndpoint.method === "GET"
                        ? "bg-semantic-emerald/10 text-semantic-emerald"
                        : "bg-brand-indigo/10 text-brand-indigo"
                    }`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <code className="text-lg text-primary">{selectedEndpoint.path}</code>
                </div>
                <button
                  onClick={() => copyToClipboard(selectedEndpoint.path)}
                  className="p-2 rounded-lg hover:bg-hover transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-semantic-emerald" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted" />
                  )}
                </button>
              </div>

              <p className="text-secondary mb-6">{selectedEndpoint.description}</p>

              {selectedEndpoint.body && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-primary">Request Body</span>
                  </div>
                  <pre className="p-4 rounded-lg bg-base border border-subtle overflow-x-auto text-xs font-mono text-secondary">
                    <code>{selectedEndpoint.body}</code>
                  </pre>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-primary">Response</span>
                </div>
                <pre className="p-4 rounded-lg bg-base border border-subtle overflow-x-auto text-xs font-mono text-secondary">
                  <code>{selectedEndpoint.response}</code>
                </pre>
              </div>
            </div>

            {/* SSE Guide */}
            <div className="p-6 rounded-xl bg-surface border border-subtle">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Code className="w-5 h-5 text-brand-indigo" />
                SSE Event Order
              </h3>
              <div className="space-y-2 text-sm text-secondary">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-amber" />
                  <code>decision</code>
                  <span>- Controller decision</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-cyan" />
                  <code>retrieval_started</code>
                  <span>- Retrieval initiated</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-amber" />
                  <code>provisional</code>
                  <span>- Provisional answer (optional)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-indigo" />
                  <code>evidence</code>
                  <span>- Retrieved evidence chunks</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-violet" />
                  <code>claims</code>
                  <span>- Grounded claims</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-semantic-emerald" />
                  <code>ttft</code>
                  <span>- Time to first token</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-indigo" />
                  <code>token</code>
                  <span>- Individual response tokens</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-semantic-emerald" />
                  <code>complete</code>
                  <span>- Response complete</span>
                </div>
              </div>
            </div>

            {/* Configuration */}
            <div className="p-6 rounded-xl bg-surface border border-subtle">
              <h3 className="text-lg font-semibold mb-4">Configuration</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-subtle">
                  <span className="text-secondary">NEXT_PUBLIC_API_URL</span>
                  <code className="text-primary">http://localhost:8000</code>
                </div>
                <div className="flex justify-between py-2 border-b border-subtle">
                  <span className="text-secondary">CHUNK_SIZE</span>
                  <code className="text-primary">600</code>
                </div>
                <div className="flex justify-between py-2 border-b border-subtle">
                  <span className="text-secondary">CHUNK_OVERLAP</span>
                  <code className="text-primary">100</code>
                </div>
                <div className="flex justify-between py-2 border-b border-subtle">
                  <span className="text-secondary">MAX_RETRIEVAL_CHUNKS</span>
                  <code className="text-primary">5</code>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-secondary">ENABLE_RERANKER</span>
                  <code className="text-primary">true</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
