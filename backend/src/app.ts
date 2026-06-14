import express from "express";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";
import settingsRouter from "@/routes/SettingsRoutes";
import workdayRouter from "@/routes/WorkdayRoutes";
import summaryRouter from "@/routes/SummaryRoutes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/settings", settingsRouter);
app.use("/api/workdays", workdayRouter);
app.use("/api/summaries", summaryRouter);

app.use(errorMiddleware);

export default app;
