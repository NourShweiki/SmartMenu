"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import { MAX_LABEL_LENGTH } from "@/domain/table-session/table-session";
import type { TableFormState } from "./table-form-model";

type SaveAction = (state: TableFormState, form: FormData) => Promise<TableFormState>;
type ButtonAction = () => Promise<void>;

export type TableView = {
  id: string;
  label: string;
  isActive: boolean;
  /** The link inside the table's QR code, shown so the owner can check or copy it. */
  scanUrl: string;
  rename: SaveAction;
  setActive: (isActive: boolean) => Promise<void>;
  regenerate: ButtonAction;
  remove: ButtonAction;
  printHref: string;
};

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";
const smallButton = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100";

function LabelError({ id, error }: { id: string; error: NonNullable<TableFormState["error"]> }) {
  const t = useTranslations("Tables");
  return (
    <p id={id} role="alert" className="text-sm text-red-700">
      {t(`errors.${error}`, { max: MAX_LABEL_LENGTH })}
    </p>
  );
}

/** "Add a table": one field. The form resets itself after a successful add (the key changes). */
export function AddTableForm({ action }: { action: SaveAction }) {
  const t = useTranslations("Tables");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form key={state.savedAt ?? 0} action={formAction} className="flex flex-col gap-2">
      <label htmlFor="new-table-label" className="text-sm font-semibold">
        {t("labelField")}
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <input
          id="new-table-label"
          name="label"
          defaultValue={state.label ?? ""}
          maxLength={MAX_LABEL_LENGTH + 20}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "new-table-error" : "new-table-hint"}
          className={`${inputClass} max-w-64 ${state.error ? "border-red-500" : "border-gray-300"}`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-5 py-2 font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {t("add")}
        </button>
      </div>
      {state.error ? <LabelError id="new-table-error" error={state.error} /> : <p id="new-table-hint" className="text-sm text-gray-500">{t("labelHint")}</p>}
    </form>
  );
}

/** One table: its name (renamed in place), state, QR link and actions. */
export function TableCardRow({ table }: { table: TableView }) {
  const t = useTranslations("Tables");
  const [state, renameAction, renaming] = useActionState(table.rename, {});

  return (
    <li className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t("tableName", { label: table.label })}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${table.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
          >
            {table.isActive ? t("active") : t("inactive")}
          </span>
        </div>
        <Link href={table.printHref} className={smallButton}>
          {t("print")}
        </Link>
      </div>

      <form key={state.savedAt ?? 0} action={renameAction} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`label-${table.id}`} className="sr-only">
            {t("labelField")}
          </label>
          <input
            id={`label-${table.id}`}
            name="label"
            defaultValue={state.label ?? table.label}
            maxLength={MAX_LABEL_LENGTH + 20}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `error-${table.id}` : undefined}
            className={`${inputClass} max-w-52 ${state.error ? "border-red-500" : "border-gray-300"}`}
          />
          <button type="submit" disabled={renaming} className={smallButton}>
            {t("rename")}
          </button>
        </div>
        {state.error && <LabelError id={`error-${table.id}`} error={state.error} />}
      </form>

      <p className="text-xs text-gray-500">
        {t("linkLabel")}: <bdi dir="ltr" className="break-all font-mono">{table.scanUrl}</bdi>
      </p>

      <div className="flex flex-wrap gap-2">
        <form action={() => table.setActive(!table.isActive)}>
          <button type="submit" className={smallButton}>
            {table.isActive ? t("deactivate") : t("activate")}
          </button>
        </form>
        <form action={table.regenerate}>
          <ConfirmSubmit question={t("newQrConfirm")} className={smallButton}>
            {t("newQr")}
          </ConfirmSubmit>
        </form>
        <form action={table.remove}>
          <ConfirmSubmit question={t("deleteConfirm")} className={`${smallButton} text-red-700`}>
            {t("delete")}
          </ConfirmSubmit>
        </form>
      </div>
    </li>
  );
}
