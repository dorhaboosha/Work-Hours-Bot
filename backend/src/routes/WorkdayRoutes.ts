import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import {
  StartWorkdaySchema,
  EndWorkdaySchema,
  DailyRecordsQuerySchema,
} from "@/validators/WorkdaySchemas";
import { EditDayParamsSchema } from "@/validators/EditWorkdaySchemas";
import {
  start,
  status,
  end,
  getEditDay,
  list,
} from "@/controllers/WorkdayController";

const router = Router();

router.post("/start", validate(StartWorkdaySchema), start);
// Static sub-paths must be declared before /:telegramId to avoid being shadowed
router.get("/status/:telegramId", status);
router.get("/edit/:telegramId/:date", validate(EditDayParamsSchema, "params"), getEditDay);
router.post("/end", validate(EndWorkdaySchema), end);
router.get("/:telegramId", validate(DailyRecordsQuerySchema, "query"), list);

export default router;
