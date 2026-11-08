import { describe, expect, it } from "vitest";
import { MAX_PUSH_ENDPOINT_LENGTH, createPushSubscription } from "./push-subscription";

// Real-looking keys as browsers give them (base64url, no padding): a 65-byte P-256 point starting with 0x04, 16 auth bytes.
const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
const keys = { p256dh: P256DH, auth: AUTH };

const FCM = "https://fcm.googleapis.com/fcm/send/dpH5lCsTSSM:APA91bHqjZxM0VImWWqDRN7U0a3AycjUf4O-byuxb_wJsKRaKvV_iKw56s16ekq6FUqoCF7k2nICUpd8fHPxVTgqLunFeVeB9lLCQZyohyAztTH8ZQL9WCxKpA6dvTG_TUIhQUFq_n";
const MOZILLA = "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABkexample";
const APPLE = "https://web.push.apple.com/QGuQyavXutnMH8U1kpqCTnSXv3kJ6qL0bBzMg6uLR_TmK3T3";
const WINDOWS = "https://wns2-par02p.notify.windows.com/w/?token=BQYAAABexample";

describe("createPushSubscription", () => {
  it("accepts the push services of Chrome/Android, Firefox, Safari/iPhone and Edge/Windows", () => {
    for (const endpoint of [FCM, MOZILLA, APPLE, WINDOWS]) {
      const result = createPushSubscription({ endpoint, keys });
      expect(result).toEqual({ ok: true, value: { endpoint, p256dh: P256DH, auth: AUTH } });
    }
  });

  it("accepts the host in any letter case and keeps the address the browser gave", () => {
    const endpoint = "https://FCM.GoogleApis.com/fcm/send/abc";
    expect(createPushSubscription({ endpoint, keys })).toEqual({ ok: true, value: { endpoint, p256dh: P256DH, auth: AUTH } });
  });

  // The server will send a request to this address, so it must never be one an attacker chose (SSRF).
  it("refuses any address that is not a known push service", () => {
    for (const endpoint of [
      "https://example.com/push",
      "https://evil-fcm.googleapis.com.example.com/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://notfcm.googleapis.com/x",
      "https://googleapis.com/x",
      "https://push.apple.com.evil.com/x",
      "https://evilpush.apple.com/x",
      "https://notify.windows.com.evil.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1/x",
    ]) {
      expect(createPushSubscription({ endpoint, keys }), endpoint).toEqual({ ok: false, error: { type: "ENDPOINT_NOT_ALLOWED" } });
    }
  });

  it("refuses an address that is not plain https on the standard port", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "ftp://fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com./fcm/send/abc",
      "not a url",
      "",
      "   ",
    ]) {
      expect(createPushSubscription({ endpoint, keys }), endpoint).toEqual({ ok: false, error: { type: "ENDPOINT_INVALID" } });
    }
  });

  it("refuses an address longer than any push service gives", () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${"a".repeat(MAX_PUSH_ENDPOINT_LENGTH)}`;
    expect(createPushSubscription({ endpoint, keys })).toEqual({ ok: false, error: { type: "ENDPOINT_INVALID" } });
  });

  it("refuses keys that are not the browser's encryption keys", () => {
    for (const bad of [
      { p256dh: "", auth: AUTH },
      { p256dh: P256DH, auth: "" },
      { p256dh: P256DH.slice(0, -1), auth: AUTH }, // 64 bytes, not 65
      { p256dh: `A${P256DH.slice(1)}`, auth: AUTH }, // not an uncompressed point (first byte is not 0x04)
      { p256dh: P256DH.replace("_", "/"), auth: AUTH }, // plain base64, not base64url
      { p256dh: `${P256DH}=`, auth: AUTH },
      { p256dh: P256DH, auth: AUTH.slice(0, -1) }, // not 16 bytes
      { p256dh: P256DH, auth: `${AUTH}AA` },
      { p256dh: P256DH, auth: "tBHItJI5svbpez7KI4CC!g" },
    ]) {
      expect(createPushSubscription({ endpoint: FCM, keys: bad }), JSON.stringify(bad)).toEqual({ ok: false, error: { type: "KEYS_INVALID" } });
    }
  });
});
