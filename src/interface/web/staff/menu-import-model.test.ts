import { describe, expect, it } from "vitest";
import { importProblem, parseCsv, readMenuCsv } from "./menu-import-model";

const HEADER = "category_en,category_ar,name_en,name_ar,description_en,description_ar,price";

describe("parseCsv", () => {
  it("splits rows and fields, with quotes, commas inside quotes, doubled quotes and line breaks in a field", () => {
    expect(parseCsv('a,b,c\r\n"1, one","say ""hi""",3\n"two\nlines",x,y\n')).toEqual([
      ["a", "b", "c"],
      ["1, one", 'say "hi"', "3"],
      ["two\nlines", "x", "y"],
    ]);
  });

  it("drops the mark Excel puts first, and blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n , \n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("works out the separator from the first line: semicolons (Excel in many countries) and tabs too", () => {
    expect(parseCsv("a;b;c\n1,5;2;3")).toEqual([
      ["a", "b", "c"],
      ["1,5", "2", "3"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("readMenuCsv", () => {
  it("reads rows into what the use case imports, prices as fils", () => {
    const read = readMenuCsv(`﻿${HEADER}\r\nStarters,المقبلات,Hummus,حمص,"Chickpeas, tahini",حمص بالطحينة,1.250\r\nGrills,المشاوي,  Kebab ,كباب,,,٤٫٥\r\n`);
    if (!read.ok) throw new Error(read.problem);
    expect(read.rows.map((r) => [r.line, r.problems])).toEqual([
      [2, []],
      [3, []],
    ]);
    expect(read.importable).toEqual([
      { category: { en: "Starters", ar: "المقبلات" }, name: { en: "Hummus", ar: "حمص" }, description: { en: "Chickpeas, tahini", ar: "حمص بالطحينة" }, priceFils: 1250 },
      { category: { en: "Grills", ar: "المشاوي" }, name: { en: "Kebab", ar: "كباب" }, description: { en: "", ar: "" }, priceFils: 4500 },
    ]);
  });

  it("finds the columns by name in any order and spelling, ignores extra ones, and does not need the descriptions", () => {
    const read = readMenuCsv("Price;Name AR;name-en;Notes;Category_EN;category ar\n2;شاي;Tea;hot;Drinks;المشروبات");
    if (!read.ok) throw new Error(read.problem);
    expect(read.importable).toEqual([{ category: { en: "Drinks", ar: "المشروبات" }, name: { en: "Tea", ar: "شاي" }, description: { en: "", ar: "" }, priceFils: 2000 }]);
  });

  it("names every problem of every row, and then offers nothing to import", () => {
    const read = readMenuCsv(`${HEADER}\nStarters,المقبلات,Hummus,حمص,,,1.250\n,المشاوي,Kebab,,,,four\nGrills,,${"x".repeat(81)},كباب,,,4.5`);
    if (!read.ok) throw new Error(read.problem);
    expect(read.rows.map((r) => [r.line, r.problems])).toEqual([
      [2, []],
      [3, ["categoryEn", "nameAr", "price"]],
      [4, ["categoryAr", "tooLong"]],
    ]);
    expect(read.importable).toEqual([]); // not even the good row: the file is corrected and uploaded again
  });

  it("refuses a file it cannot use, saying why", () => {
    expect(readMenuCsv("  \n ")).toEqual({ ok: false, problem: "empty" });
    expect(readMenuCsv("name,price\nTea,2")).toEqual({ ok: false, problem: "header", missing: ["category_en", "category_ar", "name_en", "name_ar"] });
    expect(readMenuCsv(HEADER)).toEqual({ ok: false, problem: "noRows" });
    expect(readMenuCsv(`${HEADER}\n${"Drinks,المشروبات,Tea,شاي,,,2\n".repeat(301)}`)).toEqual({ ok: false, problem: "tooManyRows" });
    expect(readMenuCsv("x".repeat(200_001))).toEqual({ ok: false, problem: "tooBig" });
  });
});

describe("importProblem", () => {
  it("turns the use case's row number into the file's line number", () => {
    expect(importProblem({ type: "ROW_INVALID", row: 1, error: { type: "INVALID_PRICE" } })).toEqual({ kind: "row", line: 2 });
    expect(importProblem({ type: "FORBIDDEN" })).toEqual({ kind: "forbidden" });
    expect(importProblem({ type: "EMPTY_IMPORT" })).toEqual({ kind: "failed" });
  });
});
