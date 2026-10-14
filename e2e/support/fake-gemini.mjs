// A stand-in for Google's Gemini API, for the browser tests ONLY (started by playwright.config.ts; the app is pointed
// at it with GEMINI_BASE_URL). It never calls the real service, so the tests are free, fast and always give the same
// answers. It reads the live menu out of the system prompt, like the real model, and answers by what the customer typed:
//   - "break"          -> HTTP 500 (the service failing)
//   - "inventedthing"  -> suggests an item id that is not on the menu (the app must refuse it)
//   - an item's name   -> suggests that item (first choice of every required option group), quantity = the first number typed
//   - anything else    -> says it found nothing, suggests nothing
// Usage: node fake-gemini.mjs <port>
import { createServer } from "node:http";

const port = Number(process.argv[2]);
const hasArabic = (s) => /[؀-ۿ]/.test(s);

function answer(body) {
  const system = body.systemInstruction?.parts?.[0]?.text ?? "";
  const menu = JSON.parse(system.slice(system.indexOf("MENU:\n") + "MENU:\n".length));
  const turns = body.contents ?? [];
  const text = String(turns[turns.length - 1]?.parts?.[0]?.text ?? "");
  const arabic = hasArabic(text);
  const say = (en, ar) => (arabic ? ar : en);

  if (text.includes("inventedthing")) {
    return { message: say("Added!", "تمام!"), lines: [{ menu_item_id: "not-on-the-menu", option_ids: [], quantity: 1 }] };
  }
  const lower = text.toLowerCase();
  const items = menu.flatMap((section) => section.items);
  const item = items.find((i) => lower.includes(i.name.en.toLowerCase()) || text.includes(i.name.ar));
  if (!item) return { message: say("I could not find that on the menu.", "لم أجد ذلك في القائمة."), lines: [] };
  if (item.sold_out) return { message: say("Sorry, that is sold out.", "عذرًا، هذا الصنف نفد."), lines: [] };

  const quantity = Number(text.match(/\d+/)?.[0] ?? 1);
  const option_ids = item.option_groups.flatMap((g) => g.options.slice(0, g.min_select).map((o) => o.option_id));
  return {
    message: say(`Added ${quantity} x ${item.name.en}`, `تمام، أضفت ${quantity} x ${item.name.ar}`),
    lines: [{ menu_item_id: item.menu_item_id, option_ids, quantity }],
  };
}

createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200).end("ok"); // the health check Playwright waits for
    return;
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    try {
      const body = JSON.parse(raw);
      const last = String(body.contents?.[body.contents.length - 1]?.parts?.[0]?.text ?? "");
      if (last.includes("break")) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "stand-in failure" } }));
        return;
      }
      const args = answer(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "reply_to_customer", args } }] } }] }));
    } catch (error) {
      res.writeHead(400).end(String(error));
    }
  });
}).listen(port, "127.0.0.1", () => console.log(`fake gemini on ${port}`));
