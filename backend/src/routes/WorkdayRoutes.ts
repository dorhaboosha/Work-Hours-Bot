import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import {
  StartWorkdaySchema,
  EndWorkdaySchema,
  DailyRecordsQuerySchema,
  RecordDayParamsSchema,
} from "@/validators/WorkdaySchemas";
import { EditDayParamsSchema, EditWorkdaySchema } from "@/validators/EditWorkdaySchemas";
import {
  start,
  status,
  end,
  getRecord,
  getEditDay,
  patchEditDay,
  list,
} from "@/controllers/WorkdayController";

const router = Router();

router.post("/start", validate(StartWorkdaySchema), start);
// Static sub-paths must be declared before /:telegramId to avoid being shadowed
router.get("/status/:telegramId", status);
router.get("/record/:telegramId/:date", validate(RecordDayParamsSchema, "params"), getRecord);
router.get("/edit/:telegramId/:date", validate(EditDayParamsSchema, "params"), getEditDay);
router.patch("/edit/:telegramId/:date", validate(EditDayParamsSchema, "params"), validate(EditWorkdaySchema), patchEditDay);
router.post("/end", validate(EndWorkdaySchema), end);
router.get("/:telegramId", validate(DailyRecordsQuerySchema, "query"), list);

export default router;
