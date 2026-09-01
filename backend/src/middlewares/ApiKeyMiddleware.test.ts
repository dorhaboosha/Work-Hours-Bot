import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { createApiKeyMiddleware } from "./ApiKeyMiddleware";
import { AppError } from "@/utils/AppError";

function makeRequest(apiKeyHeader?: string): Request {
  return {
    get: (name: string) =>
      name.toLowerCase() === "x-api-key" ? apiKeyHeader : undefined,
  } as unknown as Request;
}

describe("createApiKeyMiddleware", () => {
  const middleware = createApiKeyMiddleware("correct-secret-key");

  it("calls next() with no error when the header matches the expected key", () => {
    const req = makeRequest("correct-secret-key");
    let nextArg: unknown = "not-called";

    middleware(req, {} as Response, (err?: unknown) => {
      nextArg = err;
    });

    assert.equal(nextArg, undefined);
  });

  it("calls next() with an UNAUTHORIZED AppError when the header is missing", () => {
    const req = makeRequest(undefined);
    let nextArg: unknown;

    middleware(req, {} as Response, (err?: unknown) => {
      nextArg = err;
    });

    assert.ok(nextArg instanceof AppError);
    assert.equal((nextArg as AppError).code, "UNAUTHORIZED");
    assert.equal((nextArg as AppError).httpStatus, 401);
  });

  it("calls next() with an UNAUTHORIZED AppError when the header is wrong", () => {
    const req = makeRequest("wrong-key");
    let nextArg: unknown;

    middleware(req, {} as Response, (err?: unknown) => {
      nextArg = err;
    });

    assert.ok(nextArg instanceof AppError);
    assert.equal((nextArg as AppError).code, "UNAUTHORIZED");
  });

  it("does not throw when the provided key has a different length than expected", () => {
    const req = makeRequest("short");
    let nextArg: unknown;

    assert.doesNotThrow(() => {
      middleware(req, {} as Response, (err?: unknown) => {
        nextArg = err;
      });
    });
    assert.ok(nextArg instanceof AppError);
  });
});
