import express from "express";
import { Env } from "@/config/Env";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";
import { createApiKeyMiddleware } from "@/middlewares/ApiKeyMiddleware";
import settingsRouter from "@/routes/SettingsRoutes";
import workdayRouter from "@/routes/WorkdayRoutes";
import summaryRouter from "@/routes/SummaryRoutes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const apiKeyMiddleware = createApiKeyMiddleware(Env.API_KEY);

app.use("/api/settings", apiKeyMiddleware, settingsRouter);
app.use("/api/workdays", apiKeyMiddleware, workdayRouter);
app.use("/api/summaries", apiKeyMiddleware, summaryRouter);

app.use(errorMiddleware);

export default app;
