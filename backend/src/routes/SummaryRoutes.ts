import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import {
  WeekSummaryQuerySchema,
  MonthSummaryQuerySchema,
} from "@/validators/SummarySchemas";
import { weekSummary, monthSummary } from "@/controllers/SummaryController";

const router = Router();

router.get("/week/:telegramId", validate(WeekSummaryQuerySchema, "query"), weekSummary);
router.get("/month/:telegramId", validate(MonthSummaryQuerySchema, "query"), monthSummary);

export default router;
