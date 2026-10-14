import type { AssistantAnswer, AssistantTurn, OrderingAssistant, OrderingAssistantError } from "@/application/ports/ordering-assistant";
import type { PublicMenuSection } from "@/application/ports/public-menu-repository";
import { err, ok, type Result } from "@/domain/shared/result";
import { ANSWER_SCHEMA, fetchWithRetry, readAnswerInput, systemPromptFor, TOOL, TOOL_DESCRIPTION, toApiMessages } from "./assistant-shared";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Used unless ORDERING_ASSISTANT_MODEL names another one. Chosen 2026-10-13 after a test of 13 ordering cases (Arabic
 * dialect, English, sold-out, missing options, injection...): 12 of 13 right, nothing unsafe, the cheapest model that
 * works for our key ($0.25 in / $1.50 out per 1M tokens). The 2.5 models answer 404 for it; 3.6 and 3.5-lite were
 * rate-limited during the test, so they are unproven rather than worse.
 */
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";

type Deps = {
  apiKey: string | undefined;
  model?: string;
  /** Where the API lives (a proxy, or the stand-in the browser tests use). Google's address when empty. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Pause before the one retry (tests use 0). */
  retryDelayMs?: number;
};

/** Reads the model's function call out of the response's candidates. */
export function readGeminiAnswer(body: unknown): AssistantAnswer | null {
  const parts = (body as { candidates?: { content?: { parts?: unknown } }[] } | null)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const call = parts.find((part) => part?.functionCall?.name === TOOL)?.functionCall;
  return readAnswerInput(call?.args);
}

/**
 * The ordering assistant on Google's Gemini API (`generateContent`, plain HTTPS, no SDK), answering through a
 * forced function call so the reply is structured. SERVER ONLY: the key comes from GEMINI_API_KEY, travels in a
 * header (never in the URL, which logs keep) and never reaches a browser.
 *
 * Verified once against the real service (2026-10-13, `gemini-3.6-flash`): the request was accepted and the answer
 * came back as a function call. Everything else is tested with a stand-in for the network. Watch the cost.
 */
export class GeminiOrderingAssistant implements OrderingAssistant {
  constructor(private readonly deps: Deps) {}

  isAvailable(): boolean {
    return Boolean(this.deps.apiKey);
  }

  async reply(input: { menu: readonly PublicMenuSection[]; history: readonly AssistantTurn[] }): Promise<Result<AssistantAnswer, OrderingAssistantError>> {
    if (!this.deps.apiKey) return err({ type: "NOT_CONFIGURED" });
    const messages = toApiMessages(input.history);
    if (messages.length === 0) return err({ type: "BAD_ANSWER" });
    const model = encodeURIComponent(this.deps.model || DEFAULT_MODEL);

    let response: Response;
    try {
      response = await fetchWithRetry(
        this.deps.fetch ?? fetch,
        `${this.deps.baseUrl || BASE}/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.deps.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPromptFor(input.menu) }] },
            contents: messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
            tools: [{ functionDeclarations: [{ name: TOOL, description: TOOL_DESCRIPTION, parameters: ANSWER_SCHEMA }] }],
            toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [TOOL] } },
            generationConfig: { maxOutputTokens: 1024 },
          }),
        },
        { retryDelayMs: this.deps.retryDelayMs },
      );
    } catch (error) {
      console.error("ordering assistant: the AI service could not be reached", error);
      return err({ type: "SERVICE_FAILED" });
    }
    if (!response.ok) {
      // The status only: the body may quote the request, and the key must never end up in a log.
      console.error(`ordering assistant: the AI service answered ${response.status}`);
      return err({ type: "SERVICE_FAILED" });
    }

    const body = await response.json().catch(() => null);
    const answer = readGeminiAnswer(body);
    return answer ? ok(answer) : err({ type: "BAD_ANSWER" });
  }
}
