import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Env } from "@/config/Env";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";
import { createApiKeyMiddleware } from "@/middlewares/ApiKeyMiddleware";
import settingsRouter from "@/routes/SettingsRoutes";
import workdayRouter from "@/routes/WorkdayRoutes";
import summaryRouter from "@/routes/SummaryRoutes";

const app = express();

app.use(helmet());

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const apiKeyMiddleware = createApiKeyMiddleware(Env.API_KEY);

// Rate limit + API key check run before body parsing, so an unauthenticated
// request never gets its (possibly large/malformed) body parsed.
app.use("/api/settings", apiRateLimiter, apiKeyMiddleware, express.json(), settingsRouter);
app.use("/api/workdays", apiRateLimiter, apiKeyMiddleware, express.json(), workdayRouter);
app.use("/api/summaries", apiRateLimiter, apiKeyMiddleware, express.json(), summaryRouter);

app.use(errorMiddleware);

export default app;
