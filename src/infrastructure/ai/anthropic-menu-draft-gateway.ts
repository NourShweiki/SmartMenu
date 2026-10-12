import type { MenuDraftError, MenuDraftGateway, MenuSource } from "@/application/ports/menu-draft-gateway";
import { err, ok, type Result } from "@/domain/shared/result";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
/** Used unless MENU_IMPORT_MODEL names another one. Reading a menu page needs a model that sees images well. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";
const HEADER = "category_en,category_ar,name_en,name_ar,description_en,description_ar,price";

/**
 * What the model is asked. The rules that matter: only what is printed (never an invented item or price), both
 * languages for every name (translated when the menu has one), and an EMPTY price rather than a guess, which the
 * import preview then flags for the owner.
 */
export const PROMPT = `You are reading a restaurant's printed menu (a photo or a PDF). List every item on it as CSV.

Output ONLY CSV text: no explanation, no code fences. The first line must be exactly:
${HEADER}

Then one line per menu item:
- category_en, category_ar: the section the item is printed under (for example Starters / المقبلات). If the menu has no sections, use Menu / القائمة.
- name_en, name_ar: the item's name in English and in Arabic. If the menu prints only one language, translate the name into the other; write Arabic dish names the way restaurants in Jordan write them.
- description_en, description_ar: the item's description if one is printed, in both languages; otherwise leave both empty.
- price: the price as a plain number in Jordanian dinars with a dot as the decimal mark (for example 4.5 or 1.250), with no currency sign. If an item has several sizes with different prices, write one line per size and put the size in both names (for example "Hummus (large)").

Strict rules:
- Only list what is printed on the menu. Never invent an item, a description or a price.
- If you cannot read a price with certainty, leave the price EMPTY. Do not guess.
- Put any field that contains a comma, a quote or a line break in double quotes, and double any quote inside it.
- If the file is not a menu, output only the header line.`;

type Deps = { apiKey: string | undefined; model?: string; fetch?: typeof fetch };

/** The model's answer as CSV text: code fences and anything before the header line are dropped. Null when there is no header. */
export function extractCsv(text: string): string | null {
  const at = text.indexOf("category_en");
  if (at < 0) return null;
  const csv = text.slice(at).replace(/```+\s*$/g, "").trim();
  return csv.split(/\r?\n/).filter((line) => line.trim() !== "").length > 1 ? csv : null; // the header alone = not a menu
}

/** Base64 without Node's Buffer (this file may be loaded where Node modules are not available). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Drafts a menu with Anthropic's Messages API (plain HTTPS, no SDK). SERVER ONLY: the key comes from the server's
 * environment (ANTHROPIC_API_KEY) and never reaches a browser. Without a key the gateway is simply "not available"
 * and the screen does not offer it.
 *
 * NOT YET VERIFIED AGAINST THE REAL SERVICE (2026-10-12): written from the API's documentation, tested only with a
 * stand-in for the network. The first real run needs a key; check the request shape, the model name and the cost.
 */
export class AnthropicMenuDraftGateway implements MenuDraftGateway {
  constructor(private readonly deps: Deps) {}

  isAvailable(): boolean {
    return Boolean(this.deps.apiKey);
  }

  async draft(source: MenuSource): Promise<Result<string, MenuDraftError>> {
    if (!this.deps.apiKey) return err({ type: "NOT_CONFIGURED" });
    const data = toBase64(source.bytes);
    const file =
      source.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: source.mediaType, data } }
        : { type: "image", source: { type: "base64", media_type: source.mediaType, data } };

    let response: Response;
    try {
      response = await (this.deps.fetch ?? fetch)(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.deps.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: this.deps.model || DEFAULT_MODEL,
          max_tokens: 16000,
          messages: [{ role: "user", content: [file, { type: "text", text: PROMPT }] }],
        }),
      });
    } catch (error) {
      console.error("menu draft: the AI service could not be reached", error);
      return err({ type: "SERVICE_FAILED" });
    }
    if (!response.ok) {
      // The status only: the body may quote the request, and the key must never end up in a log.
      console.error(`menu draft: the AI service answered ${response.status}`);
      return err({ type: "SERVICE_FAILED" });
    }

    const body = (await response.json().catch(() => null)) as { content?: { type?: string; text?: string }[] } | null;
    const text = (body?.content ?? []).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
    const csv = extractCsv(text);
    return csv ? ok(csv) : err({ type: "NOTHING_FOUND" });
  }
}
