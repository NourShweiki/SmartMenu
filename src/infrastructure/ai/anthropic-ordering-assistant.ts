import type { AssistantAnswer, AssistantTurn, OrderingAssistant, OrderingAssistantError } from "@/application/ports/ordering-assistant";
import type { PublicMenuSection } from "@/application/ports/public-menu-repository";
import { err, ok, type Result } from "@/domain/shared/result";
import { ANSWER_SCHEMA, fetchWithRetry, readAnswerInput, systemPromptFor, TOOL, TOOL_DESCRIPTION, toApiMessages } from "./assistant-shared";

export { menuForPrompt, SYSTEM_PROMPT, toApiMessages } from "./assistant-shared";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
/** Used unless ORDERING_ASSISTANT_MODEL names another one. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

type Deps = { apiKey: string | undefined; model?: string; fetch?: typeof fetch; /** Pause before the one retry (tests use 0). */ retryDelayMs?: number };

/** Reads the model's tool call out of the Messages API's content blocks. */
export function readAnswer(content: unknown): AssistantAnswer | null {
  if (!Array.isArray(content)) return null;
  const call = content.find((part) => part?.type === "tool_use" && part?.name === TOOL);
  return readAnswerInput(call?.input);
}

/**
 * The ordering assistant on Anthropic's Messages API (plain HTTPS, no SDK), answering through a forced tool call so
 * the reply is structured. SERVER ONLY: the key comes from ANTHROPIC_API_KEY and never reaches a browser.
 *
 * NOT YET VERIFIED AGAINST THE REAL SERVICE: written from the API's documentation, tested with a stand-in for the
 * network. The first real run needs a key; check the request shape, the model name and the cost.
 */
export class AnthropicOrderingAssistant implements OrderingAssistant {
  constructor(private readonly deps: Deps) {}

  isAvailable(): boolean {
    return Boolean(this.deps.apiKey);
  }

  async reply(input: { menu: readonly PublicMenuSection[]; history: readonly AssistantTurn[] }): Promise<Result<AssistantAnswer, OrderingAssistantError>> {
    if (!this.deps.apiKey) return err({ type: "NOT_CONFIGURED" });
    const messages = toApiMessages(input.history);
    if (messages.length === 0) return err({ type: "BAD_ANSWER" });

    let response: Response;
    try {
      response = await fetchWithRetry(
        this.deps.fetch ?? fetch,
        ENDPOINT,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": this.deps.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: this.deps.model || DEFAULT_MODEL,
            max_tokens: 1024,
            system: systemPromptFor(input.menu),
            tools: [{ name: TOOL, description: TOOL_DESCRIPTION, input_schema: ANSWER_SCHEMA }],
            tool_choice: { type: "tool", name: TOOL },
            messages,
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

    const body = (await response.json().catch(() => null)) as { content?: unknown } | null;
    const answer = readAnswer(body?.content);
    return answer ? ok(answer) : err({ type: "BAD_ANSWER" });
  }
}
