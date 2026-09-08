import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAccount } from "./account.js";

const TOKEN = { authorization: "Bearer good-token" };
let deps;
let order;

beforeEach(() => {
  order = [];
  deps = {
    verifyIdToken: vi.fn(async (h) => {
      if (h !== "Bearer good-token") throw new Error("invalid-token");
      return "uid-123";
    }),
    purgeStripeForUid: vi.fn(async () => {
      order.push("stripe");
      return { stripeCustomerId: "cus_1", subscriptionsCancelled: 1, customerDeleted: true };
    }),
    purgeTeamsForUid: vi.fn(async () => {
      order.push("teams");
      return { disbanded: false, left: false };
    }),
    deleteBlobsForUid: vi.fn(() => (order.push("blobs"), 7)),
    deleteUsage: vi.fn(() => (order.push("usage"), true)),
  };
});

describe("authentication", () => {
  it("refuses an anonymous caller", async () => {
    await expect(deleteAccount({}, deps)).rejects.toThrow("unauthorized");
  });

  it("refuses a bad token and deletes nothing", async () => {
    await expect(deleteAccount({ authorization: "Bearer forged" }, deps)).rejects.toThrow("unauthorized");
    expect(deps.purgeStripeForUid).not.toHaveBeenCalled();
    expect(deps.deleteBlobsForUid).not.toHaveBeenCalled();
    expect(deps.deleteUsage).not.toHaveBeenCalled();
  });

  it("only ever deletes the uid inside the token", async () => {
    await deleteAccount({ ...TOKEN, "x-uid": "someone-else" }, deps);
    for (const fn of [deps.purgeStripeForUid, deps.deleteBlobsForUid, deps.deleteUsage]) {
      expect(fn).toHaveBeenCalledWith("uid-123");
    }
    expect(deps.purgeTeamsForUid).toHaveBeenCalledWith("uid-123", deps);
  });
});

describe("the cascade", () => {
  it("reports what it removed", async () => {
    await expect(deleteAccount(TOKEN, deps)).resolves.toEqual({
      ok: true,
      blobsDeleted: 7,
      usageCleared: true,
      subscriptionsCancelled: 1,
      stripeCustomerDeleted: true,
      teamDisbanded: false,
      teamLeft: false,
    });
  });

  it("stops the billing before touching storage", async () => {
    // An account that is gone but still charging is the worst failure mode, so
    // Stripe goes first and everything after it is recoverable data.
    await deleteAccount(TOKEN, deps);
    expect(order).toEqual(["stripe", "teams", "blobs", "usage"]);
  });

  it("disbands a workspace the departing user owned", async () => {
    // The subscription that paid for the seats was just cancelled, so leaving
    // the workspace standing would hand four other people a plan nobody pays for.
    deps.purgeTeamsForUid = vi.fn(async () => ({ disbanded: true, left: false, teamId: "tm_x", members: 4 }));
    await expect(deleteAccount(TOKEN, deps)).resolves.toMatchObject({ teamDisbanded: true, teamLeft: false });
  });

  it("still deletes the account when the team cleanup fails", async () => {
    // The seat cannot outlive the entitlement check either way — it reads the
    // owner's now-cancelled subscription — so this must not block the deletion.
    deps.purgeTeamsForUid = vi.fn(async () => {
      throw new Error("disk-on-fire");
    });
    await expect(deleteAccount(TOKEN, deps)).resolves.toMatchObject({ ok: true, teamDisbanded: false });
    expect(deps.deleteBlobsForUid).toHaveBeenCalled();
  });

  it("aborts the whole deletion if billing cleanup fails", async () => {
    deps.purgeStripeForUid = vi.fn(async () => {
      throw new Error("stripe 500");
    });
    const err = await deleteAccount(TOKEN, deps).catch((e) => e);
    expect(err.message).toBe("billing-cleanup-failed");
    expect(err.info.detail).toContain("stripe 500");
    expect(deps.deleteBlobsForUid).not.toHaveBeenCalled();
    expect(deps.deleteUsage).not.toHaveBeenCalled();
  });

  it("succeeds when there was nothing to clean up — a retry must finish", async () => {
    deps.purgeStripeForUid = vi.fn(async () => ({
      stripeCustomerId: null,
      subscriptionsCancelled: 0,
      customerDeleted: false,
    }));
    deps.deleteBlobsForUid = vi.fn(() => 0);
    deps.deleteUsage = vi.fn(() => false);
    await expect(deleteAccount(TOKEN, deps)).resolves.toMatchObject({ ok: true, blobsDeleted: 0 });
  });

  it("accepts the header under either casing", async () => {
    await expect(deleteAccount({ Authorization: "Bearer good-token" }, deps)).resolves.toMatchObject({ ok: true });
  });
});
