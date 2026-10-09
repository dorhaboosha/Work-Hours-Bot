import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "telegraf";
import { handleBotError } from "./handleBotError";
import { AppError } from "@/utils/AppError";

/** Runs handleBotError against a fake ctx and returns the text it replied with. */
async function replyFor(err: unknown): Promise<string> {
  const reply = mock.fn(async () => undefined);
  await handleBotError({ reply } as unknown as Context, err);
  assert.equal(reply.mock.calls.length, 1);
  return (reply.mock.calls[0].arguments as unknown[])[0] as string;
}

describe("handleBotError — DAILY_RECORD_ALREADY_CLOSED", () => {
  it("suggests /start when another work period can still be started", async () => {
    const text = await replyFor(
      new AppError("DAILY_RECORD_ALREADY_CLOSED", "closed", { canStartAnotherPeriod: true })
    );

    assert.match(text, /already closed/);
    assert.match(text, /\/start/);
  });

  it("suggests /edit instead of /start once no more periods can be started", async () => {
    const text = await replyFor(
      new AppError("DAILY_RECORD_ALREADY_CLOSED", "closed", { canStartAnotherPeriod: false })
    );

    assert.match(text, /already closed/);
    assert.match(text, /\/edit dd-mm/);
    assert.doesNotMatch(text, /\/start/);
  });
});
