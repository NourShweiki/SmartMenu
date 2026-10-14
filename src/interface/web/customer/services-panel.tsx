"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicServiceRequest } from "@/application/ports/service-request-gateway";
import { SERVICE_KINDS, type ServiceKind } from "@/domain/service-request/service-request";
import { requestServiceAction } from "./service-actions";
import type { ServiceProblem } from "./service-model";

type Props = {
  /** The requests of this visit (newest first), as the server just read them. */
  requests: readonly PublicServiceRequest[];
  /** The waiter has already signalled "ready to pay": the bill is being prepared, so it cannot be asked for again. */
  billOnItsWay: boolean;
};

/**
 * The three things a guest at a table can ask for. Each card shows one of: the button, "on its way" while the request
 * waits (the page refreshes itself, so it turns into "done" when the waiter marks it), or the last answer. What
 * happens is decided by the server (rules in the database); this only shows it. A kind a guest just asked for is
 * remembered here at once, so the button cannot be pressed twice while the page catches up.
 */
export function ServicesPanel({ requests, billOnItsWay }: Props) {
  const t = useTranslations("Services");
  const router = useRouter();
  const [sending, setSending] = useState<ServiceKind | null>(null);
  const [justAsked, setJustAsked] = useState<ReadonlySet<ServiceKind>>(new Set());
  const [problem, setProblem] = useState<ServiceProblem | null>(null);

  const waitingOnServer = new Set(requests.filter((r) => r.status === "OPEN").map((r) => r.kind));
  const lastDone = new Set(requests.filter((r) => r.status === "DONE").map((r) => r.kind));

  const ask = async (kind: ServiceKind) => {
    if (sending) return;
    setSending(kind);
    setProblem(null);
    let outcome: Awaited<ReturnType<typeof requestServiceAction>>;
    try {
      outcome = await requestServiceAction(kind);
    } catch {
      outcome = { ok: false, problem: "failed" }; // no connection, or the reply never arrived
    }
    setSending(null);
    if (outcome.ok) setJustAsked((s) => new Set(s).add(kind));
    else setProblem(outcome.problem);
    router.refresh(); // show what the server now says (also after a refusal: the state may have changed under the guest)
  };

  return (
    <div className="flex flex-col gap-4">
      {SERVICE_KINDS.map((kind) => {
        const waiting = waitingOnServer.has(kind) || justAsked.has(kind);
        const bill = kind === "REQUEST_BILL" && billOnItsWay;
        return (
          <section key={kind} className="flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-gray-200" aria-labelledby={`service-${kind}`}>
            <div>
              <h2 id={`service-${kind}`} className="text-lg font-semibold">
                {t(`kinds.${kind}.title`)}
              </h2>
              <p className="text-sm text-gray-600">{t(`kinds.${kind}.description`)}</p>
            </div>
            {bill ? (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t("billOnItsWay")}
              </p>
            ) : waiting ? (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t(`kinds.${kind}.waiting`)}
              </p>
            ) : (
              <>
                {lastDone.has(kind) && (
                  <p className="text-sm text-green-700">
                    <span aria-hidden>✓ </span>
                    {t(`kinds.${kind}.done`)}
                  </p>
                )}
                <button
                  type="button"
                  disabled={sending !== null}
                  onClick={() => void ask(kind)}
                  className="rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending === kind ? t("sending") : t("request")}
                  <span className="sr-only">: {t(`kinds.${kind}.title`)}</span>
                </button>
              </>
            )}
          </section>
        );
      })}
      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${problem}`)}
        </p>
      )}
    </div>
  );
}
