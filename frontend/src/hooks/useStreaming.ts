import { useState, useCallback, useRef } from "react";
import { api } from "@/utils/api";
import type { SSEEventType } from "@/utils/types";

interface StreamingState {
  isConnected: boolean;
  isStreaming: boolean;
  error: Error | null;
}

interface UseStreamingOptions {
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useStreaming(options: UseStreamingOptions = {}) {
  const [state, setState] = useState<StreamingState>({
    isConnected: false,
    isStreaming: false,
    error: null,
  });

  const abortRef = useRef<(() => void) | null>(null);

  const stream = useCallback(
    async (
      sessionId: string,
      transcriptChunk: string,
      onEvent: (eventType: SSEEventType, data: any) => void
    ) => {
      setState((prev) => ({ ...prev, isStreaming: true, error: null }));

      try {
        abortRef.current = await api.streamAnswer(
          sessionId,
          transcriptChunk,
          (eventType, data) => {
            setState((prev) => ({ ...prev, isConnected: true }));
            onEvent(eventType as SSEEventType, data);
          },
          (error) => {
            setState((prev) => ({ ...prev, error, isStreaming: false }));
            options.onError?.(error);
          },
          () => {
            setState((prev) => ({ ...prev, isStreaming: false }));
            options.onComplete?.();
          }
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Stream failed");
        setState((prev) => ({ ...prev, error: err, isStreaming: false }));
        options.onError?.(err);
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
      setState((prev) => ({ ...prev, isStreaming: false }));
    }
  }, []);

  return {
    ...state,
    stream,
    abort,
  };
}
