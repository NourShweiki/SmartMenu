"use server";

import { serviceRequests } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import { clientHashFor } from "./client-hash";
import { makeRateLimiter } from "./rate-limit";
import { askForService, type ServiceOutcome } from "./service-model";
import { readSessionId } from "./session-cookie";

// A guest rarely needs more than a few requests per visit. Per device: 10 in 10 minutes. Per restaurant: 200 an hour.
// In memory (per server instance): see rate-limit.ts.
const deviceLimit = makeRateLimiter({ max: 10, windowMs: 10 * 60_000 });
const restaurantLimit = makeRateLimiter({ max: 200, windowMs: 60 * 60_000 });

/**
 * One of the three buttons on the services page. Public (guests have no account): the restaurant comes from the host
 * and the visit from the HttpOnly session cookie the scan set; the browser sends only WHICH service it wants.
 */
export async function requestServiceAction(kind: unknown): Promise<ServiceOutcome> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return { ok: false, problem: "invalidRequest" };
  try {
    return await askForService(
      { request: serviceRequests.request, deviceLimit, restaurantLimit },
      {
        slug: site.restaurant.slug,
        restaurantId: site.restaurant.id,
        sessionId: await readSessionId(),
        kind,
        clientHash: await clientHashFor(site.restaurant.id),
      },
    );
  } catch (error) {
    console.error("service request: unexpected failure", error instanceof Error ? error.message : "unknown");
    return { ok: false, problem: "failed" };
  }
}
