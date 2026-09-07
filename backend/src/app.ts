import express from "express";
import helmet from "helmet";
import { prisma } from "@/config/PrismaClient";

const app = express();

app.use(helmet());

/** How long the health check waits for the DB before reporting unhealthy. */
const HEALTH_CHECK_TIMEOUT_MS = 2000;

app.get("/health", async (_req, res) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("Health check timed out waiting for the database")),
          HEALTH_CHECK_TIMEOUT_MS
        )
      ),
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[Health] Database check failed:", err);
    res.status(503).json({ status: "error" });
  }
});

export default app;
