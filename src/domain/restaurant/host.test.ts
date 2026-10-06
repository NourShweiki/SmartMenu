import { describe, expect, it } from "vitest";
import { slugFromHost } from "./host";

describe("slugFromHost", () => {
  it("reads the slug from a subdomain, ignoring the port", () => {
    expect(slugFromHost("demo-dinein.localhost:3000", "localhost")).toBe("demo-dinein");
    expect(slugFromHost("demo-grill.ourapp.com", "ourapp.com")).toBe("demo-grill");
  });

  it("is case-insensitive", () => {
    expect(slugFromHost("Demo-Grill.OurApp.com", "ourapp.com")).toBe("demo-grill");
  });

  it("returns null for the root domain itself", () => {
    expect(slugFromHost("localhost:3000", "localhost")).toBeNull();
    expect(slugFromHost("ourapp.com", "ourapp.com")).toBeNull();
  });

  it("returns null for other domains and look-alikes", () => {
    expect(slugFromHost("demo.otherapp.com", "ourapp.com")).toBeNull();
    expect(slugFromHost("demo.evilourapp.com", "ourapp.com")).toBeNull();
  });

  it("returns null for nested subdomains", () => {
    expect(slugFromHost("a.b.ourapp.com", "ourapp.com")).toBeNull();
  });

  it("returns null when no root domain is configured", () => {
    expect(slugFromHost("demo.ourapp.com", "")).toBeNull();
  });
});
