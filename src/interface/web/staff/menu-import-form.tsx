"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import type { MenuImportState } from "./menu-import-model";

type ImportAction = (state: MenuImportState, form: FormData) => Promise<MenuImportState>;

/** Upload a CSV file, look at the preview with every problem named, then import. */
export function MenuImportForm({ action }: { action: ImportAction }) {
  const t = useTranslations("MenuImport");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, {});
  const problemRows = state.rows?.filter((row) => row.problems.length > 0).length ?? 0;

  if (state.imported) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-green-50 p-4 ring-1 ring-green-200">
        <p className="font-semibold text-green-900">{t("imported", { items: state.imported.itemsAdded, categories: state.imported.categoriesAdded })}</p>
        {state.imported.itemsSkipped > 0 && <p className="text-sm text-green-900">{t("skipped", { count: state.imported.itemsSkipped })}</p>}
        <p>
          <Link href={`/${locale}/staff/menu`} className="font-semibold underline">
            {t("toMenu")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="check" />
        <label htmlFor="menu-file" className="text-sm font-semibold">
          {t("file")}
        </label>
        <input id="menu-file" name="file" type="file" accept=".csv,text/csv" required className="rounded-lg border border-gray-300 bg-white p-2 text-sm" />
        {state.fileProblem && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t(`fileProblems.${state.fileProblem}`)}
            {state.missing && state.missing.length > 0 && (
              <>
                {" "}
                <bdi dir="ltr">{state.missing.join(", ")}</bdi>
              </>
            )}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
            {pending ? t("checking") : t("check")}
          </button>
        </div>
      </form>

      {state.rows && (
        <section aria-labelledby="import-preview" className="flex flex-col gap-3">
          <h2 id="import-preview" className="text-lg font-semibold">
            {t("previewTitle", { count: state.rows.length })}
          </h2>
          {state.importError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(`importErrors.${state.importError.kind}`, { line: state.importError.line ?? 0 })}
            </p>
          )}
          {state.ready ? (
            <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-xl bg-green-50 p-3 ring-1 ring-green-200">
              <input type="hidden" name="intent" value="import" />
              <input type="hidden" name="csv" value={state.csv ?? ""} />
              <p className="text-sm text-green-900">{t("allGood")}</p>
              <button type="submit" disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2 font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
                {pending ? t("importing") : t("import", { count: state.rows.length })}
              </button>
            </form>
          ) : (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              {t("fixFirst", { count: problemRows })}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
            <table className="w-full text-start text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start">{t("columns.line")}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t("columns.category")}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t("columns.item")}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t("columns.price")}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t("columns.problems")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {state.rows.map((row) => (
                  <tr key={row.line} className={row.problems.length > 0 ? "bg-red-50" : undefined}>
                    <td className="px-3 py-2 tabular-nums">{row.line}</td>
                    <td className="px-3 py-2">
                      <bdi className="block">{row.values.category_en}</bdi>
                      <bdi className="block text-gray-600">{row.values.category_ar}</bdi>
                    </td>
                    <td className="px-3 py-2">
                      <bdi className="block">{row.values.name_en}</bdi>
                      <bdi className="block text-gray-600">{row.values.name_ar}</bdi>
                    </td>
                    <td className="px-3 py-2">
                      <bdi dir="ltr">{row.values.price}</bdi>
                    </td>
                    <td className="px-3 py-2 text-red-700">{row.problems.map((problem) => t(`rowProblems.${problem}`)).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
