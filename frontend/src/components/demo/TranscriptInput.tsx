"use client";

import { useState, useEffect } from "react";
import { Send, Loader2, Mic, MicOff, Volume2, AlertCircle } from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";

const exampleQueries = [
  "What does the ABS warning indicate?",
  "Compare the fuel efficiency of the X5 and X7 models",
  "List three safety features and explain how they work",
  "What are the maintenance intervals and tire pressure specs?",
];

interface TranscriptInputProps {
  onSend: (transcript: string) => void;
  disabled: boolean;
}

export function TranscriptInput({ onSend, disabled }: TranscriptInputProps) {
  const [input, setInput] = useState("");
  const {
    isListening,
    error: speechError,
    isSupported,
    startListening,
    stopListening,
  } = useSpeechToText();

  const handleSend = () => {
    if (input.trim()) {
      if (isListening) {
        stopListening();
      }
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

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((text) => {
        setInput(text);
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Speech Error Banner */}
      {speechError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-semantic-rose/10 border border-semantic-rose/20 text-xs text-semantic-rose">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{speechError}</span>
        </div>
      )}

      {/* Listening Indicator with Audio Pulse Waves */}
      {isListening && (
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-brand-indigo/10 border border-brand-indigo/30 animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-emerald opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-semantic-emerald"></span>
            </span>
            <span className="text-xs font-medium text-brand-indigo flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 animate-bounce" />
              Live Speech-to-Text active — speak your question...
            </span>
          </div>
          <button
            type="button"
            onClick={stopListening}
            className="text-xs text-muted hover:text-primary transition-colors underline"
          >
            Done speaking
          </button>
        </div>
      )}

      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? "Listening to voice input..."
              : "Enter your question or click the microphone to speak..."
          }
          disabled={disabled}
          className={`w-full px-4 py-3 pr-24 rounded-xl bg-surface border text-primary placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand-indigo focus:ring-offset-2 focus:ring-offset-base disabled:opacity-50 transition-colors ${
            isListening ? "border-brand-indigo ring-1 ring-brand-indigo/50" : "border-subtle"
          }`}
          rows={3}
        />

        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {/* Microphone STT Toggle */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            title={
              !isSupported
                ? "Speech recognition not supported in this browser"
                : isListening
                ? "Stop recording"
                : "Speak question (STT)"
            }
            className={`p-2.5 rounded-lg font-medium transition-all flex items-center justify-center ${
              isListening
                ? "bg-semantic-rose text-white shadow-lg shadow-semantic-rose/30 animate-pulse scale-105"
                : "bg-elevated hover:bg-hover text-secondary hover:text-primary border border-subtle"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isListening ? (
              <MicOff className="w-4 h-4 text-white" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            title="Send query"
            className="p-2.5 rounded-lg bg-gradient-brand text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Preset Suggestions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="text-xs text-muted self-center mr-1">Suggestions:</span>
        {exampleQueries.map((query) => (
          <button
            key={query}
            onClick={() => setInput(query)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg bg-elevated border border-subtle text-xs text-secondary hover:bg-hover hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {query}
          </button>
        ))}
      </div>
    </div>
  );
}
