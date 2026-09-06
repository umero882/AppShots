/**
 * Consent is the switch every non-essential thing asks before running, so the
 * important assertions here are about the answers it gives when something has
 * gone wrong: unreadable storage, a bad value, a listener that throws. In every
 * one of those cases the answer must be "no", never "yes".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getConsent, setConsent, hasAnalyticsConsent, onConsentChange, clearConsent, _resetConsentListeners,
} from "../consent";

const KEY = "appshots:cookie-consent";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

beforeEach(() => {
  _resetConsentListeners();
  vi.stubGlobal("localStorage", fakeStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("reading a choice", () => {
  it("is undecided until someone answers", () => {
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("remembers both answers", () => {
    setConsent("granted");
    expect(getConsent()).toBe("granted");
    expect(hasAnalyticsConsent()).toBe(true);

    setConsent("denied");
    expect(getConsent()).toBe("denied");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("treats a value it did not write as no answer", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [KEY]: "yes-please" }));
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("treats unreadable storage as no consent, never as agreement", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked in private mode");
      },
    });
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("answers no when there is no storage at all — the prerender in Node", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

describe("writing a choice", () => {
  it("stores anything unrecognised as a refusal", () => {
    expect(setConsent("maybe")).toBe("denied");
    expect(setConsent(undefined)).toBe("denied");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("honours the choice for this page even when it cannot be saved", () => {
    const notified = [];
    onConsentChange((v) => notified.push(v));
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(() => setConsent("granted")).not.toThrow();
    expect(notified).toEqual(["granted"]);
  });
});

describe("subscribers", () => {
  it("hears every change, including the reset", () => {
    const seen = [];
    onConsentChange((v) => seen.push(v));
    setConsent("granted");
    setConsent("denied");
    clearConsent();
    expect(seen).toEqual(["granted", "denied", null]);
  });

  it("stops after unsubscribing", () => {
    const seen = [];
    const off = onConsentChange((v) => seen.push(v));
    setConsent("granted");
    off();
    setConsent("denied");
    expect(seen).toEqual(["granted"]);
  });

  it("keeps going when one listener throws", () => {
    const seen = [];
    onConsentChange(() => {
      throw new Error("bad listener");
    });
    onConsentChange((v) => seen.push(v));
    expect(() => setConsent("granted")).not.toThrow();
    expect(seen).toEqual(["granted"]);
  });
});

describe("withdrawing", () => {
  it("puts the question back, so the banner returns", () => {
    setConsent("granted");
    clearConsent();
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
