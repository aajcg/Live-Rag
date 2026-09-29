"use client";

import { motion } from "framer-motion";
import { Code, Copy, Check } from "lucide-react";
import { useState } from "react";

const endpoints = [
  { method: "GET", path: "/health", description: "Health check" },
  { method: "GET", path: "/rag/ready", description: "Readiness check" },
  { method: "POST", path: "/rag/answer", description: "Synchronous answer" },
  { method: "POST", path: "/rag/answer/stream", description: "Streaming SSE" },
];

const codeExamples = {
  curl: `curl -X POST http://localhost:8000/rag/answer \\
  -H "Content-Type: application/json" \\
  -d '{"session_id":"demo","transcript_chunk":"What does the ABS warning indicate?"}'`,
  javascript: `const response = await fetch('http://localhost:8000/rag/answer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: 'demo',
    transcript_chunk: 'What does the ABS warning indicate?'
  })
});
const data = await response.json();`,
  python: `import requests

response = requests.post(
    'http://localhost:8000/rag/answer',
    json={
        'session_id': 'demo',
        'transcript_chunk': 'What does the ABS warning indicate?'
    }
)
data = response.json()`,
};

export function APITeaser() {
  const [activeTab, setActiveTab] = useState<"curl" | "javascript" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(codeExamples[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-24 border-t border-subtle">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Simple <span className="bg-gradient-brand bg-clip-text text-transparent">API</span>
          </h2>
          <p className="text-secondary max-w-2xl mx-auto">
            RESTful endpoints with Server-Sent Events for streaming.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Endpoints table */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="p-6 rounded-xl bg-surface border border-subtle inner-highlight">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Code className="w-5 h-5 text-brand-indigo" />
                Endpoints
              </h3>
              <div className="space-y-3">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.path}
                    className="flex items-center gap-3 p-3 rounded-lg bg-elevated"
                  >
                    <span
                      className={`px-2 py-1 rounded text-xs font-mono font-medium ${
                        endpoint.method === "GET"
                          ? "bg-semantic-emerald/10 text-semantic-emerald"
                          : "bg-brand-indigo/10 text-brand-indigo"
                      }`}
                    >
                      {endpoint.method}
                    </span>
                    <code className="text-sm text-secondary font-mono">
                      {endpoint.path}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Code example */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="p-6 rounded-xl bg-surface border border-subtle inner-highlight">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {(["curl", "javascript", "python"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === tab
                          ? "bg-elevated text-primary"
                          : "text-secondary hover:text-primary"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={copyCode}
                  className="p-2 rounded-lg hover:bg-hover transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-semantic-emerald" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted" />
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-base border border-subtle overflow-x-auto text-xs font-mono text-secondary">
                <code>{codeExamples[activeTab]}</code>
              </pre>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
