"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

const exampleQueries = [
  "What does the ABS warning indicate?",
  "Compare the fuel efficiency of the X5 and X7 models",
  "List three safety features and explain how they work",
];

interface TranscriptInputProps {
  onSend: (transcript: string) => void;
  disabled: boolean;
}

export function TranscriptInput({ onSend, disabled }: TranscriptInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your question..."
          disabled={disabled}
          className="flex-1 px-4 py-3 rounded-xl bg-surface border border-subtle text-primary placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand-indigo focus:ring-offset-2 focus:ring-offset-base disabled:opacity-50"
          rows={3}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="px-4 rounded-xl bg-gradient-brand text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {exampleQueries.map((query) => (
          <button
            key={query}
            onClick={() => setInput(query)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg bg-elevated border border-subtle text-sm text-secondary hover:bg-hover hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {query}
          </button>
        ))}
      </div>
    </div>
  );
}
