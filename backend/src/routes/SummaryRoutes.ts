import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import { TelegramIdParamSchema } from "@/validators/CommonSchemas";
import { weekSummary, monthSummary } from "@/controllers/SummaryController";

const router = Router();

router.get("/week/:telegramId", validate(TelegramIdParamSchema, "params"), weekSummary);
router.get("/month/:telegramId", validate(TelegramIdParamSchema, "params"), monthSummary);

export default router;
