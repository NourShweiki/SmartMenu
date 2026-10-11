import { describe, expect, it } from "vitest";
import { createPickupCustomer } from "./pickup";

describe("createPickupCustomer", () => {
  it("tidies the name and brings the number into international form", () => {
    expect(createPickupCustomer({ name: "  Ali   Hasan ", phone: "079 123 4567" })).toEqual({ ok: true, value: { name: "Ali Hasan", phone: "+962791234567" } });
    expect(createPickupCustomer({ name: "علي حسن", phone: "٠٧٩١٢٣٤٥٦٧" })).toEqual({ ok: true, value: { name: "علي حسن", phone: "+962791234567" } });
    expect(createPickupCustomer({ name: "A", phone: "+962771234567" }).ok).toBe(true);
    expect(createPickupCustomer({ name: "ن".repeat(60), phone: "0781234567" }).ok).toBe(true);
  });

  it("needs a name that can be called out", () => {
    const phone = "0791234567";
    expect(createPickupCustomer({ name: "   ", phone })).toEqual({ ok: false, error: { type: "NAME_REQUIRED" } });
    expect(createPickupCustomer({ name: "x".repeat(61), phone })).toEqual({ ok: false, error: { type: "NAME_TOO_LONG", max: 60 } });
    expect(createPickupCustomer({ name: "<b>Ali</b>", phone })).toEqual({ ok: false, error: { type: "NAME_INVALID" } });
    expect(createPickupCustomer({ name: "Ali\u0007", phone })).toEqual({ ok: false, error: { type: "NAME_INVALID" } });
  });

  it("needs a Jordanian mobile number", () => {
    expect(createPickupCustomer({ name: "Ali", phone: "" })).toEqual({ ok: false, error: { type: "PHONE_INVALID" } });
    expect(createPickupCustomer({ name: "Ali", phone: "064123456" })).toEqual({ ok: false, error: { type: "PHONE_INVALID" } });
    expect(createPickupCustomer({ name: "Ali", phone: "+966501234567" })).toEqual({ ok: false, error: { type: "PHONE_INVALID" } });
  });
});
