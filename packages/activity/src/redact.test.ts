import { describe, expect, it } from "vitest";

import { createRedactor, findTokenKeys, lockedToken, parseLockedToken } from "./redact.js";

const AADHAAR = "1234-5678-9012";

describe("lockedToken", () => {
  it("formats the token placeholder", () => {
    expect(lockedToken("aadhaar")).toBe("{{LOCKED:aadhaar}}");
    expect(parseLockedToken("{{LOCKED:aadhaar}}")).toBe("aadhaar");
    expect(parseLockedToken("plaintext")).toBeNull();
  });
});

describe("createRedactor", () => {
  it("replaces a locked value with its token in title, detail and meta", () => {
    const redactor = createRedactor({ aadhaar: AADHAAR });
    const clean = redactor.redact({
      title: `Filled form with ${AADHAAR}`,
      detail: `Aadhaar ${AADHAAR} used`,
      meta: { aadhaar: AADHAAR, site: "example.com" },
    });
    expect(clean.title).toBe("Filled form with {{LOCKED:aadhaar}}");
    expect(clean.detail).toBe("Aadhaar {{LOCKED:aadhaar}} used");
    expect(clean.meta).toEqual({ aadhaar: "{{LOCKED:aadhaar}}", site: "example.com" });
    expect(JSON.stringify(clean)).not.toContain(AADHAAR);
  });

  it("redacts a meta entry stored under a locked key even when the plaintext is unknown", () => {
    const redactor = createRedactor([{ key: "otp", value: "" }]);
    const clean = redactor.redact({
      title: "Verification code received",
      meta: { otp: "984210" },
    });
    expect(clean.meta).toEqual({ otp: "{{LOCKED:otp}}" });
  });

  it("leaves existing tokens untouched and reports token keys", () => {
    const redactor = createRedactor({ aadhaar: AADHAAR });
    const clean = redactor.redact({
      title: "Filled {{LOCKED:aadhaar}}",
      meta: { aadhaar: "{{LOCKED:aadhaar}}" },
    });
    expect(clean.title).toBe("Filled {{LOCKED:aadhaar}}");
    expect(findTokenKeys(clean.title)).toEqual(["aadhaar"]);
  });

  it("detects leftover plaintext for inspection", () => {
    const redactor = createRedactor({ aadhaar: AADHAAR });
    expect(redactor.containsPlaintext(`value ${AADHAAR}`)).toBe(true);
    expect(redactor.containsPlaintext("{{LOCKED:aadhaar}}")).toBe(false);
    expect(redactor.containsPlaintext(undefined)).toBe(false);
  });

  it("passes input through unchanged when no secrets are configured", () => {
    const redactor = createRedactor();
    const input = { title: "Plain title", detail: "detail", meta: { a: "b" } };
    expect(redactor.redact(input)).toBe(input);
  });
});
