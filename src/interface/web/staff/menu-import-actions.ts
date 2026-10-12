"use server";

import { revalidatePath } from "next/cache";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { MAX_MENU_SOURCE_BYTES } from "@/application/use-cases/menu/draft-menu-from-file";
import { draftProblem, importProblem, MAX_CSV_CHARS, readMenuCsv, type MenuImportState } from "./menu-import-model";
import { requireStaff } from "./require-staff";

/**
 * The menu import screen's one action. "check": reads the uploaded CSV file and answers with a preview (nothing is
 * written). "draft": sends an uploaded photo or PDF of a printed menu to the AI service and answers with the SAME
 * preview, built from its draft (nothing is written either; the draft is checked like a typed file). "import": reads the SAME text again (sent back by the page; a preview is never trusted) and,
 * only if every row is fine, adds the items. Who may do this is decided by the session and the use case.
 */
export async function menuImportAction(locale: string, _prev: MenuImportState, form: FormData): Promise<MenuImportState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  const intent = form.get("intent");
  const importing = intent === "import";
  const actor = { restaurantId: staff.restaurantId, role: staff.role };

  let csv: string;
  let drafted = false;
  if (intent === "draft") {
    const file = form.get("source");
    if (!(file instanceof File) || file.size === 0) return { draftProblem: "fileEmpty" };
    if (file.size > MAX_MENU_SOURCE_BYTES) return { draftProblem: "fileTooLarge" }; // refused before it is read into memory
    const draft = await menu.draftFromFile(actor, { bytes: new Uint8Array(await file.arrayBuffer()) });
    if (!draft.ok) return { draftProblem: draftProblem(draft.error) };
    csv = draft.value.slice(0, MAX_CSV_CHARS);
    drafted = true;
  } else if (importing) {
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
  // A draft that does not even have the columns is the service's mistake, not a file the owner can correct.
  if (!read.ok) return drafted ? { draftProblem: "nothingFound" } : { fileProblem: read.problem, missing: read.missing };
  const ready = read.importable.length > 0;
  if (!importing || !ready) return { csv, rows: read.rows, ready, drafted };

  const result = await menu.importMenu(actor, read.importable);
  if (!result.ok) return { csv, rows: read.rows, ready, importError: importProblem(result.error) };
  revalidatePath(`/${l}/staff/menu`);
  return { imported: result.value };
}
