"use server";

import { revalidatePath } from "next/cache";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { importProblem, MAX_CSV_CHARS, readMenuCsv, type MenuImportState } from "./menu-import-model";
import { requireStaff } from "./require-staff";

/**
 * The menu import screen's one action, in two steps. "check": reads the uploaded file and answers with a preview
 * (nothing is written). "import": reads the SAME text again (sent back by the page; a preview is never trusted) and,
 * only if every row is fine, adds the items. Who may do this is decided by the session and the use case.
 */
export async function menuImportAction(locale: string, _prev: MenuImportState, form: FormData): Promise<MenuImportState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  const importing = form.get("intent") === "import";

  let csv: string;
  if (importing) {
    const sent = form.get("csv");
    csv = typeof sent === "string" ? sent : "";
  } else {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { fileProblem: "empty" };
    if (file.size > MAX_CSV_CHARS * 4) return { fileProblem: "tooBig" }; // bytes; a character is at most 4 of them
    csv = await file.text();
    // Not saved as UTF-8 (plain "CSV" from Excel on Windows): Arabic text arrives as unreadable characters.
    if (csv.includes("�")) return { fileProblem: "encoding" };
  }

  const read = readMenuCsv(csv);
  if (!read.ok) return { fileProblem: read.problem, missing: read.missing };
  const ready = read.importable.length > 0;
  if (!importing || !ready) return { csv, rows: read.rows, ready };

  const result = await menu.importMenu({ restaurantId: staff.restaurantId, role: staff.role }, read.importable);
  if (!result.ok) return { csv, rows: read.rows, ready, importError: importProblem(result.error) };
  revalidatePath(`/${l}/staff/menu`);
  return { imported: result.value };
}
