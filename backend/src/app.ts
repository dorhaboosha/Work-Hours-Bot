import express from "express";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";
import settingsRouter from "@/routes/SettingsRoutes";
import workdayRouter from "@/routes/WorkdayRoutes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/settings", settingsRouter);
app.use("/api/workdays", workdayRouter);
// app.use("/api/summaries", summaryRouter); (task 7.7)

app.use(errorMiddleware);

export default app;
