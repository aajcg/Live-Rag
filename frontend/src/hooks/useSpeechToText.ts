"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        setIsSupported(true);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // already stopped
      }
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(
    (onInterimOrFinal?: (text: string, isFinal: boolean) => void) => {
      setError(null);
      if (typeof window === "undefined") return;

      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setError("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
        return;
      }

      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch (e) {}
        }

        const recognition = new SpeechRecognition() as SpeechRecognitionInstance;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let currentInterim = "";
          let finalChunk = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const text = res[0].transcript;
            if (res.isFinal) {
              finalChunk += text;
            } else {
              currentInterim += text;
            }
          }

          if (finalChunk) {
            setTranscript((prev) => {
              const updated = (prev ? prev + " " : "") + finalChunk.trim();
              onInterimOrFinal?.(updated, true);
              return updated;
            });
          }

          setInterimTranscript(currentInterim);
          if (currentInterim && !finalChunk) {
            onInterimOrFinal?.(currentInterim, false);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === "no-speech") {
            // harmless timeout when user is silent
            return;
          }
          if (event.error === "not-allowed") {
            setError("Microphone access was denied. Please allow microphone access in your browser settings.");
          } else {
            setError(`Speech recognition error: ${event.error}`);
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript("");
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        setError(err.message || "Failed to start speech recognition.");
        setIsListening(false);
      }
    },
    []
  );

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
