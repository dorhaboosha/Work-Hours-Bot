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
app.use(express.json());

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

app.use("/api/settings", apiRateLimiter, apiKeyMiddleware, settingsRouter);
app.use("/api/workdays", apiRateLimiter, apiKeyMiddleware, workdayRouter);
app.use("/api/summaries", apiRateLimiter, apiKeyMiddleware, summaryRouter);

app.use(errorMiddleware);

export default app;
