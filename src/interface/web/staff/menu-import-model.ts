import type { DraftMenuError } from "@/application/use-cases/menu/draft-menu-from-file";
import { MAX_IMPORT_ROWS, type MenuImportError, type MenuImportRow } from "@/application/use-cases/menu/import-menu";
import { parsePriceInput } from "@/interface/web/price-input";

// Reading a menu spreadsheet (a CSV file, as Excel and Google Sheets export it) for the import screen. Pure: the
// server action hands the file's text in and gets rows and problems back; kept out of the "use server" file so it
// can be unit tested.

/** Largest file the screen accepts (characters). A 300-line menu is a few dozen KB. */
export const MAX_CSV_CHARS = 200_000;

export const IMPORT_COLUMNS = ["category_en", "category_ar", "name_en", "name_ar", "description_en", "description_ar", "price"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
/** The descriptions may be left out of the file altogether; the rest must be there. */
const REQUIRED_COLUMNS: readonly ImportColumn[] = ["category_en", "category_ar", "name_en", "name_ar", "price"];

export type RowProblem = "categoryEn" | "categoryAr" | "nameEn" | "nameAr" | "price" | "tooLong";

/** One data line of the file as the preview shows it. `line` is its line number in the file (the header is line 1). */
export type PreviewRow = {
  readonly line: number;
  readonly values: Record<ImportColumn, string>;
  readonly problems: readonly RowProblem[];
};

export type FileProblem = "empty" | "tooBig" | "encoding" | "header" | "noRows" | "tooManyRows";

export type MenuCsv =
  | { ok: false; problem: FileProblem; missing?: readonly ImportColumn[] }
  | { ok: true; rows: readonly PreviewRow[]; /** Rows without a problem, ready for the use case. Empty unless every row is fine. */ importable: readonly MenuImportRow[] };

/**
 * Splits CSV text into rows of fields. Understands quoted fields (with commas, line breaks and doubled quotes
 * inside), Windows and Unix line ends, and the invisible mark Excel puts at the start of a UTF-8 file. The separator
 * is whichever of comma, semicolon or tab the first line uses most (Excel writes semicolons in many countries).
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const count = (separator: string) => firstLine.split(separator).length - 1;
  const separator = [",", ";", "\t"].reduce((best, candidate) => (count(candidate) > count(best) ? candidate : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Lines with nothing in them (a trailing blank line, an empty spreadsheet row) are not rows.
  return rows.filter((fields) => fields.some((value) => value.trim() !== ""));
}

/** A header cell as a column name: "Category EN", "category_en" and " category en " are the same column. */
const columnOf = (header: string): ImportColumn | null => {
  const name = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (IMPORT_COLUMNS as readonly string[]).includes(name) ? (name as ImportColumn) : null;
};

/**
 * Reads the file: finds the columns by their names in the first line (any order; extra columns are ignored), then
 * checks every row for what the screen can already see is missing or wrong. The domain rules decide once more
 * inside the use case; this is what lets the owner fix the file before anything is imported.
 */
export function readMenuCsv(text: string): MenuCsv {
  if (text.trim() === "") return { ok: false, problem: "empty" };
  if (text.length > MAX_CSV_CHARS) return { ok: false, problem: "tooBig" };
  const [header, ...lines] = parseCsv(text);
  if (!header) return { ok: false, problem: "empty" };

  const position = new Map<ImportColumn, number>();
  header.forEach((cell, index) => {
    const column = columnOf(cell);
    if (column && !position.has(column)) position.set(column, index);
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !position.has(column));
  if (missing.length > 0) return { ok: false, problem: "header", missing };
  if (lines.length === 0) return { ok: false, problem: "noRows" };
  if (lines.length > MAX_IMPORT_ROWS) return { ok: false, problem: "tooManyRows" };

  const importable: MenuImportRow[] = [];
  const rows = lines.map((fields, index): PreviewRow => {
    const value = (column: ImportColumn) => (position.has(column) ? (fields[position.get(column)!] ?? "").trim().replace(/\s+/g, " ") : "");
    const values = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, value(column)])) as Record<ImportColumn, string>;
    const priceFils = parsePriceInput(values.price);
    const problems: RowProblem[] = [];
    if (!values.category_en) problems.push("categoryEn");
    if (!values.category_ar) problems.push("categoryAr");
    if (!values.name_en) problems.push("nameEn");
    if (!values.name_ar) problems.push("nameAr");
    if (priceFils === null) problems.push("price");
    if ([values.category_en, values.category_ar, values.name_en, values.name_ar].some((v) => v.length > 80) || values.description_en.length > 500 || values.description_ar.length > 500) problems.push("tooLong");
    if (problems.length === 0) {
      importable.push({
        category: { en: values.category_en, ar: values.category_ar },
        name: { en: values.name_en, ar: values.name_ar },
        description: { en: values.description_en, ar: values.description_ar },
        priceFils: priceFils!,
      });
    }
    return { line: index + 2, values, problems };
  });
  return { ok: true, rows, importable: importable.length === rows.length ? importable : [] };
}

export type MenuImportState = {
  /** The file's text, kept between "check" and "import" (the browser does not send a file twice). */
  csv?: string;
  fileProblem?: FileProblem;
  missing?: readonly ImportColumn[];
  rows?: readonly PreviewRow[];
  /** True when every row is fine: the import button is offered. */
  ready?: boolean;
  /** The preview was drafted by AI from a photo or PDF: the screen says to check every line. */
  drafted?: boolean;
  /** Why a photo or PDF could not be turned into a draft. */
  draftProblem?: "notConfigured" | "fileEmpty" | "fileTooLarge" | "fileType" | "nothingFound" | "serviceFailed" | "forbidden";
  /** A refusal of the import itself. `line` is the file line of a row the menu rules refused. */
  importError?: { kind: "forbidden" | "row" | "failed"; line?: number };
  imported?: { categoriesAdded: number; itemsAdded: number; itemsSkipped: number };
};

/** The use case's refusal as what the screen shows. Row n of the import is line n + 1 of the file (the header is line 1). */
export function importProblem(error: MenuImportError): NonNullable<MenuImportState["importError"]> {
  if (error.type === "FORBIDDEN") return { kind: "forbidden" };
  if (error.type === "ROW_INVALID") return { kind: "row", line: error.row + 1 };
  return { kind: "failed" };
}

/** Why a draft could not be made, as what the screen shows. */
export function draftProblem(error: DraftMenuError): NonNullable<MenuImportState["draftProblem"]> {
  switch (error.type) {
    case "NOT_CONFIGURED":
      return "notConfigured";
    case "FILE_EMPTY":
      return "fileEmpty";
    case "FILE_TOO_LARGE":
      return "fileTooLarge";
    case "FILE_TYPE_NOT_ALLOWED":
      return "fileType";
    case "NOTHING_FOUND":
      return "nothingFound";
    case "FORBIDDEN":
      return "forbidden";
    default:
      return "serviceFailed";
  }
}
