const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Request timeout");
    }
    throw error;
  }
}

async function handleResponse(response: Response): Promise<any> {
  if (!response.ok) {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      throw new ApiError(
        json.message || json.detail || "API request failed",
        response.status,
        json
      );
    } catch {
      throw new ApiError(text || "API request failed", response.status);
    }
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export const api = {
  async health(): Promise<{ status: string }> {
    const response = await fetchWithTimeout(`${API_URL}/health`);
    return handleResponse(response);
  },

  async ready(): Promise<{
    ready: boolean;
    indexed_chunks: number;
    corpus: string;
    embedding_provider: string;
    status: string;
  }> {
    const response = await fetchWithTimeout(`${API_URL}/rag/ready`);
    return handleResponse(response);
  },

  async ingest(force = false): Promise<any> {
    const response = await fetchWithTimeout(
      `${API_URL}/rag/ingest?force=${force}`,
      { method: "POST" }
    );
    return handleResponse(response);
  },

  async retrieve(query: string, topK?: number): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/rag/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK }),
    });
    return handleResponse(response);
  },

  async answer(sessionId: string, transcriptChunk: string): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/rag/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        transcript_chunk: transcriptChunk,
      }),
    });
    return handleResponse(response);
  },

  async getSession(sessionId: string): Promise<any> {
    const response = await fetchWithTimeout(
      `${API_URL}/rag/session/${sessionId}`
    );
    return handleResponse(response);
  },

  async metrics(): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/metrics`);
    return handleResponse(response);
  },

  /**
   * Stream answer via SSE.
   * The backend emits:
   *   event: <name>\ndata: <json>\n\n
   *
   * Returns an abort function.
   */
  async streamAnswer(
    sessionId: string,
    transcriptChunk: string,
    onEvent: (event: string, data: any) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<() => void> {
    const controller = new AbortController();

    const run = async () => {
      try {
        const response = await fetch(`${API_URL}/rag/answer/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            transcript_chunk: transcriptChunk,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new ApiError(text || "Stream request failed", response.status);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new ApiError("Response body is not readable");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            onComplete?.();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          // SSE messages are separated by double-newline
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? "";

          for (const message of messages) {
            if (!message.trim()) continue;

            // Parse SSE lines: event: <name>\ndata: <json>
            const lines = message.split("\n");
            let eventName = "message";
            let dataStr = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataStr = line.slice(6).trim();
              }
            }

            if (dataStr && dataStr !== "[DONE]") {
              try {
                const parsed = JSON.parse(dataStr);
                onEvent(eventName, parsed);
              } catch (e) {
                console.warn("Failed to parse SSE data:", dataStr, e);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          onError?.(error);
        }
      }
    };

    run();
    return () => controller.abort();
  },
};
