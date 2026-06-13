import express from "express";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes are mounted here as they are implemented (tasks 5.6, 6.11, 7.7)
// app.use("/api/settings", settingsRouter);
// app.use("/api/workdays", workdayRouter);
// app.use("/api/summaries", summaryRouter);

app.use(errorMiddleware);

export default app;
