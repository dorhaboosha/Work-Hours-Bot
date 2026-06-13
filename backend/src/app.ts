import express from "express";
import { errorMiddleware } from "@/middlewares/ErrorMiddleware";
import settingsRouter from "@/routes/SettingsRoutes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/settings", settingsRouter);

app.use(errorMiddleware);

export default app;
