import { describe, expect, it } from "vitest";
import { readLabel, tableProblem } from "./table-form-model";

describe("tableProblem", () => {
  it("maps every use-case failure to what the form shows", () => {
    expect(tableProblem({ type: "LABEL_REQUIRED" })).toBe("required");
    expect(tableProblem({ type: "LABEL_TOO_LONG", max: 20 })).toBe("tooLong");
    expect(tableProblem({ type: "LABEL_INVALID" })).toBe("invalid");
    expect(tableProblem({ type: "LABEL_TAKEN" })).toBe("taken");
    expect(tableProblem({ type: "FORBIDDEN" })).toBe("forbidden");
    expect(tableProblem({ type: "NOT_FOUND" })).toBe("notFound");
    expect(tableProblem({ type: "DELETED" })).toBe("notFound");
  });
});

describe("readLabel", () => {
  const form = (entries: Record<string, string>) => new Map(Object.entries(entries)) as unknown as FormData;
  it("reads the label, an empty string when absent, and cuts a huge paste", () => {
    expect(readLabel(form({ label: " Terrace 2 " }))).toBe(" Terrace 2 "); // tidying is the domain's job
    expect(readLabel(form({}))).toBe("");
    expect(readLabel(form({ label: "x".repeat(5000) }))).toHaveLength(100);
  });
});
