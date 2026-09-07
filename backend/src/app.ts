import express from "express";
import helmet from "helmet";
import { prisma } from "@/config/PrismaClient";

const app = express();

app.use(helmet());

/** How long the health check waits for the DB before reporting unhealthy. */
const HEALTH_CHECK_TIMEOUT_MS = 2000;

app.get("/health", async (_req, res) => {
  // The HTTP response is bounded to HEALTH_CHECK_TIMEOUT_MS either way; this
  // timer is only cleared so a fast, healthy check doesn't leave a dangling
  // setTimeout alive for the rest of the window. The query itself is bounded
  // server-side too, via the pool's statement_timeout (see PrismaClient.ts)
  // — so a genuinely hung query still gets aborted and its connection freed,
  // rather than being held forever regardless of what this race does.
  let timeoutHandle: NodeJS.Timeout;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("Health check timed out waiting for the database")),
          HEALTH_CHECK_TIMEOUT_MS
        );
      }),
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[Health] Database check failed:", err);
    res.status(503).json({ status: "error" });
  } finally {
    clearTimeout(timeoutHandle!);
  }
});

export default app;
