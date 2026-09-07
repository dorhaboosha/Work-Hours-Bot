import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "telegraf";
import { createOwnerOnlyMiddleware } from "./OwnerOnlyMiddleware";

function makeCtx(userId: number | undefined): Context {
  return { from: userId === undefined ? undefined : { id: userId } } as unknown as Context;
}

describe("createOwnerOnlyMiddleware", () => {
  const middleware = createOwnerOnlyMiddleware("12345");

  it("calls next() when the update is from the owner", async () => {
    let nextCalled = false;
    await middleware(makeCtx(12345), () => {
      nextCalled = true;
      return Promise.resolve();
    });
    assert.equal(nextCalled, true);
  });

  it("does not call next() when the update is from a different user", async () => {
    let nextCalled = false;
    await middleware(makeCtx(99999), () => {
      nextCalled = true;
      return Promise.resolve();
    });
    assert.equal(nextCalled, false);
  });

  it("does not call next() when ctx.from is missing", async () => {
    let nextCalled = false;
    await middleware(makeCtx(undefined), () => {
      nextCalled = true;
      return Promise.resolve();
    });
    assert.equal(nextCalled, false);
  });
});
