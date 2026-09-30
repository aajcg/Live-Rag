"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, StopCircle, Mic, MicOff, AlertCircle } from "lucide-react";

const EXAMPLE_QUERIES = [
  { label: "ABS Warning", text: "What does the ABS warning light indicate?" },
  {
    label: "Multi-intent",
    text: "Compare fuel efficiency of X5 and X7, and list three safety features",
  },
  {
    label: "Delta test",
    text: "What is the warranty for the electric motor in Aventro EVs?",
  },
  { label: "Wait test", text: "Tell me about" },
];

interface TranscriptInputProps {
  onSend: (transcript: string) => void;
  disabled: boolean;
  onAbort?: () => void;
}

export function TranscriptInput({ onSend, disabled, onAbort }: TranscriptInputProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  // Setup Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let final = "";
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          
          if (final.trim()) {
            // Auto-send when a phrase is finalized to simulate streaming STT
            const finalizedText = final.trim();
            setInput(""); // Clear for the next chunk
            onSend(finalizedText);
          } else {
            setInput(interim);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== "no-speech") {
            setSttError(event.error);
            setIsListening(false);
          }
        };

        recognition.onend = () => {
          // Continuous recognition sometimes stops automatically; restart if still supposed to be listening
          if (isListening) {
             recognition.start();
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [isListening, onSend]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      setSttError("Speech recognition not supported in this browser.");
      return;
    }
    setSttError(null);
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      // Send whatever is left in the buffer
      if (input.trim() && !disabled) {
        onSend(input.trim());
        setInput("");
      }
    } else {
      setInput(""); // clear input when starting fresh
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // Handle race conditions where it might already be started
      }
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-3">
      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q.label}
            onClick={() => { setInput(q.text); setSttError(null); }}
            disabled={disabled || isListening}
            className="px-2.5 py-1 rounded-lg bg-elevated border border-subtle text-xs text-secondary hover:bg-hover hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {q.label}
          </button>
        ))}
      </div>

      {sttError && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-semantic-rose/10 text-semantic-rose text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>{sttError}</span>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening... speak now." : "Type a transcript chunk… (or use the mic)"}
            disabled={disabled || isListening}
            rows={2}
            className={`w-full px-4 py-3 rounded-xl bg-surface border border-subtle text-sm text-primary placeholder:text-muted resize-none focus:outline-none focus:ring-2 disabled:opacity-50 transition-all leading-relaxed ${
              isListening ? "border-brand-cyan/50 ring-2 ring-brand-cyan/20 animate-pulse bg-brand-cyan/5" : "focus:ring-brand-indigo/50"
            }`}
            style={{ minHeight: "64px" }}
          />
          {input && !isListening && (
            <div className="absolute bottom-2 right-3 text-[10px] text-muted font-mono">
              {input.length} chars
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {disabled && !isListening ? (
            <button
              onClick={onAbort}
              className="w-11 h-11 rounded-xl bg-semantic-rose/10 border border-semantic-rose/30 text-semantic-rose hover:bg-semantic-rose/20 transition-colors flex items-center justify-center"
              title="Stop streaming"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={toggleMic}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors shadow-sm ${
                isListening 
                  ? "bg-semantic-rose text-white hover:bg-semantic-rose/90 animate-pulse" 
                  : "bg-elevated border border-subtle text-secondary hover:text-primary hover:bg-hover"
              }`}
              title={isListening ? "Stop listening" : "Start Live STT"}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!input.trim() || isListening || disabled}
            className="w-11 h-11 rounded-xl bg-gradient-brand text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-glow"
            title="Send (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-[10px] text-muted px-1">
        Click the Mic icon to speak! Finalized sentences are automatically sent to the pipeline to simulate streaming STT.
      </p>
    </div>
  );
}
