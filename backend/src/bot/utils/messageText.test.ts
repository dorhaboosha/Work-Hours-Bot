import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "telegraf";
import { getMessageText, getCommandArgs } from "./messageText";

function makeCtx(text?: string): Context {
  return {
    message: text === undefined ? undefined : { text },
  } as unknown as Context;
}

describe("getMessageText", () => {
  it("returns the message text when present", () => {
    assert.equal(getMessageText(makeCtx("/edit 12-06")), "/edit 12-06");
  });

  it("returns an empty string when the update has no message", () => {
    assert.equal(getMessageText(makeCtx(undefined)), "");
  });
});

describe("getCommandArgs", () => {
  it("splits a command's arguments, excluding the command token", () => {
    assert.deepEqual(getCommandArgs(makeCtx("/edit 12-06")), ["12-06"]);
  });

  it("collapses repeated whitespace between arguments", () => {
    assert.deepEqual(getCommandArgs(makeCtx("/record   12-06")), ["12-06"]);
  });

  it("returns an empty array for a bare command with no arguments", () => {
    assert.deepEqual(getCommandArgs(makeCtx("/status")), []);
  });

  it("returns an empty array when the update has no message", () => {
    assert.deepEqual(getCommandArgs(makeCtx(undefined)), []);
  });
});
