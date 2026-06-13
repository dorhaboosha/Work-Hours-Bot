import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import {
  StartWorkdaySchema,
  EndWorkdaySchema,
  DailyRecordsQuerySchema,
} from "@/validators/WorkdaySchemas";
import {
  start,
  status,
  end,
  list,
} from "@/controllers/WorkdayController";

const router = Router();

router.post("/start", validate(StartWorkdaySchema), start);
// /status/:telegramId must be declared before /:telegramId to avoid being shadowed
router.get("/status/:telegramId", status);
router.post("/end", validate(EndWorkdaySchema), end);
router.get("/:telegramId", validate(DailyRecordsQuerySchema, "query"), list);

export default router;
