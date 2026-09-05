/* Minimal Gemini client wrapper.
 * Exports `callGeminiJSON` which posts a prompt + response schema to the
 * Gemini-like endpoint configured via `process.env.GEMINI_URL` and
 * `process.env.GEMINI_API_KEY`.
 *
 * This is intentionally small: it centralizes the JSON-only call pattern
 * the importer code expects. In environments where the real Gemini API
 * isn't configured, the function throws a helpful error so failures are
 * obvious during development.
 */

export interface GeminiCallParams {
  prompt: string;
  // JSON Schema describing the expected response
  responseSchema: object;
  // Optional timeout / token limits
  maxTokens?: number;
}

export async function callGeminiJSON<T>(params: GeminiCallParams): Promise<T> {
  const url = process.env.GEMINI_URL;
  const key = process.env.GEMINI_API_KEY;

  if (!url || !key) {
    throw new Error(
      "Gemini client not configured: set GEMINI_URL and GEMINI_API_KEY in the environment to enable LLM-backed parsing."
    );
  }

  const body = {
    prompt: params.prompt,
    responseSchema: params.responseSchema,
    maxTokens: params.maxTokens ?? 2000,
    responseMimeType: "application/json",
  } as const;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  // Expecting JSON only
  const data = (await res.json()) as T;
  return data;
}

export default callGeminiJSON;
