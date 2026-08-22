import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SessionStore, startSessionCleanup } from "./SessionStore";

describe("SessionStore", () => {
  const userId = "user-1";

  beforeEach(() => {
    SessionStore.clear(userId);
    SessionStore.clear("user-2");
  });

  it("returns undefined for a user with no session", () => {
    assert.equal(SessionStore.get(userId), undefined);
    assert.equal(SessionStore.has(userId), false);
  });

  it("set() stores a session retrievable via get()", () => {
    SessionStore.set(userId, { step: "setup:hours", data: {} });

    assert.deepEqual(SessionStore.get(userId), { step: "setup:hours", data: {} });
    assert.equal(SessionStore.has(userId), true);
  });

  it("update() merges partial step/data into an existing session", () => {
    SessionStore.set(userId, { step: "setup:hours", data: { hours: 8 } });
    SessionStore.update(userId, { step: "setup:workdays", data: { workdays: [1, 2, 3] } });

    assert.deepEqual(SessionStore.get(userId), {
      step: "setup:workdays",
      data: { hours: 8, workdays: [1, 2, 3] },
    });
  });

  it("update() is a no-op when no session exists for the user", () => {
    SessionStore.update(userId, { step: "setup:hours", data: {} });

    assert.equal(SessionStore.has(userId), false);
  });

  it("clear() removes the session", () => {
    SessionStore.set(userId, { step: "setup:hours", data: {} });
    SessionStore.clear(userId);

    assert.equal(SessionStore.has(userId), false);
  });

  describe("evictIdle", () => {
    it("removes sessions idle for longer than maxIdleMs and keeps fresh ones", () => {
      const now = Date.now();
      SessionStore.set(userId, { step: "setup:hours", data: {} });
      SessionStore.set("user-2", { step: "setup:hours", data: {} });

      const evicted = SessionStore.evictIdle(1000, now + 5000);

      assert.equal(evicted, 2);
      assert.equal(SessionStore.has(userId), false);
      assert.equal(SessionStore.has("user-2"), false);
    });

    it("does not evict sessions still within the idle window", () => {
      const now = Date.now();
      SessionStore.set(userId, { step: "setup:hours", data: {} });

      const evicted = SessionStore.evictIdle(60_000, now + 1000);

      assert.equal(evicted, 0);
      assert.equal(SessionStore.has(userId), true);
    });

    it("update() refreshes updatedAt so an active session survives a sweep that would evict a stale one", () => {
      const originalDateNow = Date.now;
      const oneHourAgo = originalDateNow() - 60 * 60 * 1000;

      // Session was created an hour ago...
      Date.now = () => oneHourAgo;
      SessionStore.set(userId, { step: "setup:hours", data: {} });
      Date.now = originalDateNow;

      // ...but the user just responded, refreshing updatedAt to "now".
      SessionStore.update(userId, { data: { hours: 8 } });

      // A 30-minute idle window would evict the hour-old creation time, but not "now".
      const evicted = SessionStore.evictIdle(30 * 60 * 1000);

      assert.equal(evicted, 0);
      assert.equal(SessionStore.has(userId), true);
    });
  });
});

describe("startSessionCleanup", () => {
  it("schedules a sweep at the given interval that evicts idle sessions", () => {
    const originalSetInterval = global.setInterval;
    const originalDateNow = Date.now;
    let intervalCallback: (() => void) | undefined;
    let capturedMs: number | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setInterval = (cb: () => void, ms: number) => {
      intervalCallback = cb;
      capturedMs = ms;
      return 0 as unknown as NodeJS.Timeout;
    };

    try {
      const userId = "cleanup-user";
      SessionStore.clear(userId);

      // Force this session's updatedAt to be far in the past so the sweep evicts it.
      Date.now = () => originalDateNow() - 60 * 60 * 1000;
      SessionStore.set(userId, { step: "setup:hours", data: {} });
      Date.now = originalDateNow;

      startSessionCleanup(10_000, 30 * 60 * 1000);
      assert.equal(capturedMs, 10_000);

      intervalCallback?.();

      assert.equal(SessionStore.has(userId), false);
    } finally {
      global.setInterval = originalSetInterval;
      Date.now = originalDateNow;
    }
  });
});
