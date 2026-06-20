import { Router } from "express";
import { weekSummary, monthSummary } from "@/controllers/SummaryController";

const router = Router();

router.get("/week/:telegramId", weekSummary);
router.get("/month/:telegramId", monthSummary);

export default router;
