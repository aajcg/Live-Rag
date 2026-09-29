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

  async ready(): Promise<{ ready: boolean; chunk_count: number }> {
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
    const response = await fetchWithTimeout(`${API_URL}/rag/session/${sessionId}`);
    return handleResponse(response);
  },

  async metrics(): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/metrics`);
    return handleResponse(response);
  },

  // Streaming answer using fetch + ReadableStream
  async streamAnswer(
    sessionId: string,
    transcriptChunk: string,
    onEvent: (event: string, data: any) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<() => void> {
    const controller = new AbortController();

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
      if (!reader) {
        throw new ApiError("Response body is not readable");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      const processStream = async () => {
        try {
          let currentEvent = "message";
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              onComplete?.();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim() === "") continue;
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  onEvent(currentEvent, parsed);
                } catch (e) {
                  console.error("Failed to parse SSE data:", data, e);
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

      processStream();
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        onError?.(error);
      }
    }

    // Return abort function
    return () => controller.abort();
  },
};
