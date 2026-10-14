"use server";

import { askOrderingAssistant } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import { askAssistant, type AssistantOutcome } from "./assistant-model";
import { clientHashFor } from "./client-hash";
import { makeRateLimiter } from "./rate-limit";

// Every question costs money on the restaurant's AI key. Per device: 20 in 10 minutes. Per restaurant: 300 an hour.
// In memory (per server instance): see rate-limit.ts.
const deviceLimit = makeRateLimiter({ max: 20, windowMs: 10 * 60_000 });
const restaurantLimit = makeRateLimiter({ max: 300, windowMs: 60 * 60_000 });

/**
 * The chat box's "send". Public (guests have no account): the restaurant comes from the host; the browser sends only
 * the chat so far and its cart, and gets back the reply and the cart with the checked suggestions added. It never
 * places an order: the customer confirms in the cart as before.
 */
export async function askAssistantAction(history: unknown, cart: unknown): Promise<AssistantOutcome> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return { ok: false, problem: "invalidRequest" };
  try {
    return await askAssistant(
      { ask: askOrderingAssistant, deviceLimit, restaurantLimit },
      { restaurant: site.restaurant, history, cart, clientHash: await clientHashFor(site.restaurant.id) },
    );
  } catch (error) {
    console.error("ordering assistant: unexpected failure", error instanceof Error ? error.message : "unknown");
    return { ok: false, problem: "failed" };
  }
}
