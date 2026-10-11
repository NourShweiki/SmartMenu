import { describe, expect, it } from "vitest";
import type { CreateRestaurantError } from "@/application/use-cases/platform/create-restaurant";
import { newRestaurantProblem, readNewRestaurantForm, toCreateRequest } from "./new-restaurant-model";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("readNewRestaurantForm", () => {
  it("reads the fields, tidied", () => {
    const read = readNewRestaurantForm(
      form({ id: "99999999-9999-4000-8000-000000000001", nameEn: "  Falafel House ", nameAr: " بيت الفلافل ", slug: " falafel-house ", businessType: "takeout", ownerEmail: " owner@falafel.test " }),
    );
    expect(read).toEqual({
      id: "99999999-9999-4000-8000-000000000001",
      values: { nameEn: "Falafel House", nameAr: "بيت الفلافل", slug: "falafel-house", businessType: "takeout", ownerEmail: "owner@falafel.test" },
    });
    expect(toCreateRequest(read.id, read.values)).toEqual({
      id: "99999999-9999-4000-8000-000000000001",
      slug: "falafel-house",
      name: { en: "Falafel House", ar: "بيت الفلافل" },
      businessType: "takeout",
      ownerEmail: "owner@falafel.test",
    });
  });

  it("survives missing, over-long and made-up input", () => {
    const read = readNewRestaurantForm(form({ nameEn: "x".repeat(500), businessType: "spaceship", slug: "s".repeat(100) }));
    expect(read.id).toBe("");
    expect(read.values.nameEn).toHaveLength(80);
    expect(read.values.slug).toHaveLength(40);
    expect(read.values.businessType).toBe("dine-in"); // anything that is not "takeout"
    expect(read.values.nameAr).toBe("");
    expect(read.values.ownerEmail).toBe("");
  });
});

describe("newRestaurantProblem", () => {
  it("puts each refusal where the founder can act on it", () => {
    const cases: [CreateRestaurantError, unknown][] = [
      [{ type: "NAME_REQUIRED", lang: "en" }, { errors: { nameEn: "required" } }],
      [{ type: "NAME_REQUIRED", lang: "ar" }, { errors: { nameAr: "required" } }],
      [{ type: "INVALID_SLUG", reason: "FORMAT" }, { errors: { slug: "slugFormat" } }],
      [{ type: "INVALID_SLUG", reason: "RESERVED" }, { errors: { slug: "slugReserved" } }],
      [{ type: "SLUG_TAKEN" }, { errors: { slug: "slugTaken" } }],
      [{ type: "INVALID_EMAIL" }, { errors: { ownerEmail: "emailInvalid" } }],
      [{ type: "EMAIL_TAKEN" }, { errors: { ownerEmail: "emailTaken" } }],
      [{ type: "ALREADY_CREATED" }, { formError: "alreadyCreated" }],
      [{ type: "NOT_SIGNED_IN" }, { formError: "notAllowed" }],
      [{ type: "NOT_A_FOUNDER" }, { formError: "notAllowed" }],
      [{ type: "INVALID_ID" }, { formError: "failed" }],
      [{ type: "NO_ORDER_MODE_ENABLED" }, { formError: "failed" }],
    ];
    for (const [error, problem] of cases) expect(newRestaurantProblem(error)).toEqual(problem);
  });
});
